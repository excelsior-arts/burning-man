// A certificate for the machine's own name, so a phone on the wifi gets a secure
// context and therefore WebGPU. Safari asks once whether to trust it.
import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {hostname, networkInterfaces} from 'node:os';
const host = process.argv[2] ?? hostname();
const ips = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && n.family === 'IPv4' && !n.internal)
  .map((n) => n.address);
mkdirSync('tmp/certs', {recursive: true});
const conf = `[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = ${host}
[ext]
subjectAltName = ${['DNS:' + host, 'DNS:localhost', 'IP:127.0.0.1', ...ips.map((a) => 'IP:' + a)].join(',')}
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
`;
writeFileSync('tmp/certs/openssl.cnf', conf);
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '365',
  '-keyout', 'tmp/certs/key.pem', '-out', 'tmp/certs/cert.pem', '-config', 'tmp/certs/openssl.cnf'],
  {stdio: 'inherit'});
console.log(`certificate for ${host} and ${ips.join(', ')} written to tmp/certs/`);
