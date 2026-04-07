//! `nci` CLI binary entrypoint.

mod cli;

fn main() {
    std::process::exit(match cli::run() {
        Ok(()) => 0,
        Err(message) => {
            if !message.is_empty() {
                eprintln!("{message}");
            }
            1
        }
    });
}
