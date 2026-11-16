const crypto = require('crypto');

const rand = (bytes) => crypto.randomBytes(bytes).toString('hex').toUpperCase();

// generateId('REG') -> REG-9F3A21C7
exports.generateId = (prefix) => `${prefix}-${rand(4)}`;

// certificateId() -> CERT-2026-A1B2C3
exports.certificateId = () => `CERT-${new Date().getFullYear()}-${rand(3)}`;
