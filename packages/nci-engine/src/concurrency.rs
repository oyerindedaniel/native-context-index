//! Resolves which index stages may use Rayon so package-level and inner parallelism never nest.

use tracing::{info, trace};

use crate::index_options::IndexOptions;

const THREAD_BUDGET_ENV: &str = "NCI_THREAD_BUDGET";

/// Bounded save channel: each package worker may block on `send` once; one extra slot per thread pipelines a second graph.
const SAVE_QUEUE_SLOTS_PER_THREAD: usize = 2;
/// Save-queue floor when `thread_budget` is 1–2 (channel still useful for backpressure).
const SAVE_QUEUE_MIN_CAPACITY: usize = 4;
/// Sequential package indexing: only one crawl typically finishes ahead of the writer.
const SAVE_QUEUE_SEQUENTIAL_CAPACITY: usize = 4;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexConcurrencyPlan {
    pub package_parallel: bool,
    pub crawl_layer_parallel_allowed: bool,
    pub min_layer_files_for_parallel: usize,
    pub graph_dep_parallel_allowed: bool,
    pub min_symbols_for_dep_parallel: usize,
    pub save_queue_capacity: usize,
    pub thread_budget: usize,
}

pub fn thread_budget() -> usize {
    if let Ok(raw) = std::env::var(THREAD_BUDGET_ENV)
        && let Ok(parsed) = raw.trim().parse::<usize>()
    {
        return parsed.max(1);
    }
    std::thread::available_parallelism()
        .map(|non_zero| non_zero.get())
        .unwrap_or(1)
        .max(1)
}

/// Minimum files/symbols before inner Rayon pays off; `.max(2)` avoids parallel on a single-core budget of 1.
fn parallel_threshold(thread_budget: usize) -> usize {
    thread_budget.max(2)
}

pub fn resolve_index_concurrency_plan(
    index_options: &IndexOptions,
    package_count: usize,
) -> IndexConcurrencyPlan {
    let thread_budget = thread_budget();
    let min_batch = parallel_threshold(thread_budget);

    let package_parallel = index_options.parallel && package_count > 1;

    let crawl_layer_parallel_allowed = if package_parallel {
        if index_options.parallel_crawl_layers == Some(true) {
            trace!("parallel_crawl_layers=true ignored while package parallelism is active");
        }
        false
    } else {
        match index_options.parallel_crawl_layers {
            Some(false) => false,
            Some(true) | None => true,
        }
    };

    let graph_dep_parallel_allowed = !package_parallel && index_options.parallel_resolve_deps;

    let save_queue_capacity = if package_parallel {
        (thread_budget * SAVE_QUEUE_SLOTS_PER_THREAD).max(SAVE_QUEUE_MIN_CAPACITY)
    } else {
        SAVE_QUEUE_SEQUENTIAL_CAPACITY
    };

    IndexConcurrencyPlan {
        package_parallel,
        crawl_layer_parallel_allowed,
        min_layer_files_for_parallel: min_batch,
        graph_dep_parallel_allowed,
        min_symbols_for_dep_parallel: min_batch,
        save_queue_capacity,
        thread_budget,
    }
}

pub fn log_index_concurrency_plan(plan: &IndexConcurrencyPlan, package_count: usize) {
    info!(
        package_count,
        thread_budget = plan.thread_budget,
        package_parallel = plan.package_parallel,
        crawl_layer_parallel = plan.crawl_layer_parallel_allowed,
        crawl_min_layer_files = plan.min_layer_files_for_parallel,
        graph_dep_parallel = plan.graph_dep_parallel_allowed,
        graph_min_symbols = plan.min_symbols_for_dep_parallel,
        save_queue_capacity = plan.save_queue_capacity,
        "index concurrency plan"
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::index_options::IndexOptions;

    #[test]
    fn multi_package_default_uses_package_parallel_only() {
        let plan = resolve_index_concurrency_plan(&IndexOptions::default(), 4);
        assert!(plan.package_parallel);
        assert!(!plan.crawl_layer_parallel_allowed);
        assert!(!plan.graph_dep_parallel_allowed);
        assert_eq!(plan.save_queue_capacity, (plan.thread_budget * 2).max(4));
    }

    #[test]
    fn single_package_disables_package_parallel() {
        let plan = resolve_index_concurrency_plan(&IndexOptions::default(), 1);
        assert!(!plan.package_parallel);
        assert!(plan.crawl_layer_parallel_allowed);
        assert!(plan.graph_dep_parallel_allowed);
        assert_eq!(plan.save_queue_capacity, 4);
    }

    #[test]
    fn sequential_allows_inner_parallel() {
        let index_options = IndexOptions {
            parallel: false,
            ..Default::default()
        };
        let plan = resolve_index_concurrency_plan(&index_options, 4);
        assert!(!plan.package_parallel);
        assert!(plan.crawl_layer_parallel_allowed);
        assert!(plan.graph_dep_parallel_allowed);
    }

    #[test]
    fn no_parallel_resolve_deps_when_sequential() {
        let index_options = IndexOptions {
            parallel: false,
            parallel_resolve_deps: false,
            ..Default::default()
        };
        let plan = resolve_index_concurrency_plan(&index_options, 4);
        assert!(!plan.graph_dep_parallel_allowed);
    }

    #[test]
    fn no_parallel_resolve_deps_during_package_parallel() {
        let index_options = IndexOptions {
            parallel: true,
            parallel_resolve_deps: false,
            ..Default::default()
        };
        let plan = resolve_index_concurrency_plan(&index_options, 4);
        assert!(plan.package_parallel);
        assert!(!plan.graph_dep_parallel_allowed);
    }

    #[test]
    fn force_sequential_crawl_layers() {
        let index_options = IndexOptions {
            parallel: false,
            parallel_crawl_layers: Some(false),
            ..Default::default()
        };
        let plan = resolve_index_concurrency_plan(&index_options, 2);
        assert!(!plan.crawl_layer_parallel_allowed);
    }

    #[test]
    fn thresholds_track_thread_budget() {
        let plan = resolve_index_concurrency_plan(&IndexOptions::default(), 2);
        let expected = plan.thread_budget.max(2);
        assert_eq!(plan.min_layer_files_for_parallel, expected);
        assert_eq!(plan.min_symbols_for_dep_parallel, expected);
    }
}
