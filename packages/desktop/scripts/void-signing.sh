#!/usr/bin/env bash
set -euo pipefail

dir="${VOID_SIGNING_DIR:-$HOME/void/state/signing}"
name="${VOID_SIGNING_NAME:-VOID Local Signing}"
keychain="$dir/void-signing.keychain-db"
password_file="$dir/keychain-password"
openssl_bin="${VOID_OPENSSL:-/usr/bin/openssl}"

mkdir -p "$dir"
chmod 700 "$dir"

if [ ! -s "$password_file" ]; then
  (umask 077 && "$openssl_bin" rand -hex 32 > "$password_file")
fi
chmod 600 "$password_file"
password="$(cat "$password_file")"

if [ ! -f "$keychain" ]; then
  security create-keychain -p "$password" "$keychain"
fi
security unlock-keychain -p "$password" "$keychain"
security set-keychain-settings "$keychain"

if ! security find-certificate -c "$name" "$keychain" > /dev/null 2>&1; then
  work="$(mktemp -d)"
  trap 'rm -rf "${work:?}"' EXIT
  cat > "$work/req.cnf" <<EOF
[req]
distinguished_name = dn
prompt = no
x509_extensions = ext
[dn]
CN = $name
[ext]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
subjectKeyIdentifier = hash
EOF
  "$openssl_bin" req -x509 -newkey rsa:2048 -nodes -days 3650 -sha256 \
    -config "$work/req.cnf" -keyout "$work/key.pem" -out "$work/cert.pem" 2> /dev/null
  p12_password="$("$openssl_bin" rand -hex 16)"
  "$openssl_bin" pkcs12 -export -inkey "$work/key.pem" -in "$work/cert.pem" -name "$name" \
    -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 \
    -out "$work/identity.p12" -passout "pass:$p12_password"
  security import "$work/identity.p12" -k "$keychain" -f pkcs12 -P "$p12_password" \
    -T /usr/bin/codesign -T /usr/bin/security > /dev/null
fi

security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$password" "$keychain" > /dev/null

list_file="$(mktemp)"
security list-keychains -d user > "$list_file"
search=()
found=0
while IFS= read -r line; do
  line="$(printf '%s' "$line" | sed -e 's/^[[:space:]]*"//' -e 's/"[[:space:]]*$//')"
  [ -n "$line" ] || continue
  [ "$line" = "$keychain" ] && found=1
  search+=("$line")
done < "$list_file"
rm -f "${list_file:?}"
if [ "$found" = 0 ]; then
  security list-keychains -d user -s "${search[@]}" "$keychain"
fi

hash="$(security find-certificate -c "$name" -Z "$keychain" | awk '/SHA-1 hash:/ { print $3; exit }')"
echo "VOID_SIGNING_KEYCHAIN=$keychain"
echo "VOID_SIGNING_NAME=$name"
echo "VOID_SIGNING_HASH=$hash"
