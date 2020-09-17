var urlsByTab = {};
var rootUrl;

function RequestInfo(webRequest) {
  this.webRequest = webRequest;
  this.domain = getSecLevelDomain(webRequest.url);
  this.party = checkIfThirdParty(webRequest); // move this function into the object?
}

function checkIfThirdParty(requestDetails){
  if(!requestDetails.requestHeaders[0].value.includes(rootUrl)){
  	return "third";
  }
  return "other";
}

function logURL(requestDetails) {
	if(urlsByTab[requestDetails.tabId] == undefined || requestDetails.originUrl == undefined){
		urlsByTab[requestDetails.tabId] = [];
  } else {
    urlsByTab[requestDetails.tabId].push(new RequestInfo(requestDetails));
    notifyPopupOfNewRequests(requestDetails);
  }
}

function tabUpdate() { // use this in line 11
  getActiveTab().then((tabs) => {
    let tab = tabs[0];
		getSecLevelDomain(tab.url);
  });
}

function getSecLevelDomain(tabUrl){
  const url = new URL(tabUrl);
  rootUrl = url.hostname.split('.').splice(-2).join(".");
  return rootUrl;
}
function getActiveTab() {
  return browser.tabs.query({active: true, currentWindow: true});
}

function notifyPopupOfNewRequests(request) {
  //Could not establish connection. Receiving end does not exist.
  //differntiate between if popup open or not? or simply handleError
  var sending = browser.runtime.sendMessage({
    request: new RequestInfo(request)
  });
  // sending.then(handleResponse, handleError);
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
