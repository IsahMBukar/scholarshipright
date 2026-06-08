// proot-fix.cjs — Proot compatibility shim for Node.js
// Fixes: os.networkInterfaces() crash (uv_interface_addresses ERR_SYSTEM_ERROR)
const os = require('os');
const original = os.networkInterfaces.bind(os);
os.networkInterfaces = function() {
  try { return original(); }
  catch (e) {
    return { lo: [{ address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: true, cidr: '127.0.0.1/8' }] };
  }
};
