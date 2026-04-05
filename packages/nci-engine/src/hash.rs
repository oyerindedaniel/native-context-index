use sha2::{Digest, Sha256};

pub fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let digest_bytes = hasher.finalize();
    hex_lower_from_bytes(digest_bytes.as_ref())
}

fn hex_lower_from_bytes(bytes: &[u8]) -> String {
    const HEX_ASCII_LOWERCASE: &[u8; 16] = b"0123456789abcdef";
    let capacity = bytes.len().saturating_mul(2);
    let mut hex_output = String::with_capacity(capacity);
    for byte_value in bytes {
        let high_nibble = usize::from(byte_value >> 4);
        let low_nibble = usize::from(byte_value & 0x0f);
        hex_output.push(char::from(HEX_ASCII_LOWERCASE[high_nibble]));
        hex_output.push(char::from(HEX_ASCII_LOWERCASE[low_nibble]));
    }
    hex_output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_hex_is_deterministic() {
        let first = sha256_hex("export interface Foo {}");
        let second = sha256_hex("export interface Foo {}");
        assert_eq!(first.len(), 64);
        assert_eq!(first, second);
    }

    #[test]
    fn sha256_hex_differs_for_different_input() {
        assert_ne!(
            sha256_hex("export interface Foo {}"),
            sha256_hex("export interface Bar {}")
        );
    }
}
