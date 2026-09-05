/**
 * CenaPlanner email gateway for Google Apps Script.
 * Create a Script Property named GATEWAY_TOKEN with the same random value
 * configured as NOTIFICATION_GATEWAY_TOKEN on Render before deploying.
 */
function doPost(event) {
  try {
    var payload = JSON.parse((event && event.postData && event.postData.contents) || '{}');
    var expectedToken = PropertiesService.getScriptProperties().getProperty('GATEWAY_TOKEN');
    if (!expectedToken || !constantTimeEqual_(String(payload.gatewayToken || ''), expectedToken)) {
      return json_({ ok: false, error: 'unauthorized' });
    }
    var recipient = String(payload.to || '').trim();
    var subject = String(payload.subject || '').trim();
    var text = String(payload.text || '').trim();
    var html = String(payload.html || '').trim();
    var idempotencyKey = String(payload.idempotencyKey || '').trim();
    if (!recipient || !subject || !text || !idempotencyKey) {
      return json_({ ok: false, error: 'invalid_payload' });
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var properties = PropertiesService.getScriptProperties();
      var sentKey = 'sent:' + digest_(idempotencyKey);
      if (properties.getProperty(sentKey)) return json_({ ok: true, duplicate: true });
      GmailApp.sendEmail(recipient, subject, text, { htmlBody: html || text, name: 'CenaPlanner' });
      properties.setProperty(sentKey, new Date().toISOString());
    } finally {
      lock.releaseLock();
    }
    return json_({ ok: true });
  } catch (error) {
    console.error(error);
    return json_({ ok: false, error: 'delivery_failed' });
  }
}
function constantTimeEqual_(left, right) {
  var maxLength = Math.max(left.length, right.length);
  var difference = left.length ^ right.length;
  for (var index = 0; index < maxLength; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}
function digest_(value) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value);
  return bytes.map(function (byte) {
    var normalized = byte < 0 ? byte + 256 : byte;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}
function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
