chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRIGGER_CAPTURE') {
    chrome.runtime.sendMessage({ type: 'CAPTURE_DOM_REQUEST' }, (response) => {
      if (response && response.domTree) {
        chrome.runtime.sendMessage({
          type: 'CAPTURE_RESULT',
          data: response,
        }, (saveResponse) => {
          sendResponse(saveResponse);
        });
      } else {
        sendResponse({ error: 'Failed to capture DOM' });
      }
    });
    return true;
  }
});
