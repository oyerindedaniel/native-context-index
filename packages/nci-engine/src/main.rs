//! `nci` CLI binary entrypoint.

mod cli;

fn main() {
    // On Windows, turn on ANSI processing so colored banner output
    // renders instead of printing raw escape bytes.
    let _ = enable_ansi_support::enable_ansi_support();

    std::process::exit(match cli::run() {
        Ok(cli::CliExit::Success) => 0,
        Ok(cli::CliExit::QueryNotFound) => cli::EXIT_QUERY_NOT_FOUND,
        Ok(cli::CliExit::UpgradeAvailable) => 3,
        Err(message) => {
            if !message.is_empty() {
                eprintln!("{message}");
            }
            1
        }
    });
}
