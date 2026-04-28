//! `nci` CLI binary entrypoint.

mod cli;

fn main() {
    // On Windows, turn on ANSI processing so colored banner output
    // renders instead of printing raw escape bytes.
    let _ = enable_ansi_support::enable_ansi_support();

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
