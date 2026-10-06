async function acknowledgeWebhook(res, work, onError = () => {}) {
  try {
    await work();
    return res.status(200).json({ received: true });
  } catch (error) {
    try {
      onError(error);
    } catch {}
    return res.status(500).json({ received: false });
  }
}

module.exports = { acknowledgeWebhook };
