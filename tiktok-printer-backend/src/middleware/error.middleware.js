function errorHandler(err, req, res, next) {
  console.error('[Server Error]', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
}

function notFound(req, res, next) {
  res.status(404).json({ error: 'API endpoint not found' });
}

function healthCheck(req, res) {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
}

function errorMetrics(req, res) {
  res.status(200).json({ errors: 0 }); // todo: replace with real metrics
}

module.exports = {
  errorHandler,
  notFound,
  healthCheck,
  errorMetrics
};