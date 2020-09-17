var urlsByTab = {};
var rootUrl;

function checkIfThirdParty(requestDetails){
  if(!requestDetails.requestHeaders[0].value.includes(rootUrl)){
  	return "third";
  }
  return "other";
}

function logURL(requestDetails) {
	if(urlsByTab[requestDetails.tabId] == undefined || requestDetails.originUrl == undefined){
		urlsByTab[requestDetails.tabId] = {};
  } else {
    urlsByTab[requestDetails.tabId][requestDetails.url] = checkIfThirdParty(requestDetails);
    notifyPopupOfNewRequests(requestDetails);
  }
}

function tabUpdate() { // use this in line 11
  getActiveTab().then((tabs) => {
    let tab = tabs[0];
		const url = new URL(tab.url);
		rootUrl = url.hostname.split('.').splice(-2).join("."); 
  });
}

function getActiveTab() {
  return browser.tabs.query({active: true, currentWindow: true});
}

function notifyPopupOfNewRequests(request) {
  var sending = browser.runtime.sendMessage({
    request: request
  });
  // sending.then(handleResponse, handleError);  just shooting it into the void?
}

// update when the tab is updated
browser.tabs.onUpdated.addListener(tabUpdate);
// update when the tab is activated
browser.tabs.onActivated.addListener(tabUpdate);

browser.webRequest.onSendHeaders.addListener(
  logURL,
	{urls: ["<all_urls>"]},
  ["requestHeaders"]
);
