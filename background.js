var requestsByTab = [];
var responsesByTab = [];
var rootUrl;

function RequestInfo(webRequest) {
  this.url = webRequest.url;
  this.domain = getSecLevelDomain(webRequest.url);
  this.party = checkIfThirdParty(this.domain); // move this function into the object?
  this.header = webRequest.requestHeaders;
}

function ResponseInfo(webRequest) {
  this.url = webRequest.url;
  this.domain = getSecLevelDomain(webRequest.url);
  this.party = checkIfThirdParty(this.domain); // move this function into the object?
  this.header = webRequest.responseHeaders;
}

function checkIfThirdParty(domain){
  if(domain != rootUrl){
  	return "third";
  }
  return "first";
}

function logRequest(requestDetails) {
  //what behaviour is causing this? can be replaced by clearTab?
	if(requestsByTab[requestDetails.tabId] == undefined || requestDetails.originUrl == undefined){
		requestsByTab[requestDetails.tabId] = [];
  } else {
    let request = new RequestInfo(requestDetails);
    requestsByTab[requestDetails.tabId].push(request);
    if(requestDetails.tabId == getActiveTab()) {
      notifyPopupOfNewRequests(request);
    }
  }
}

function logResponse(responseDetails) {
  if(responsesByTab[responseDetails.tabId] == undefined || responseDetails.originUrl == undefined){
    responsesByTab[responseDetails.tabId] = [];
  } else {
    let response = new ResponseInfo(responseDetails);
    responsesByTab[responseDetails.tabId].push(response);
  }
}

function clearTab(){
  var tab = setRootUrl();
  requestsByTab[tab] = [];
  responsesByTab[tab] = [];
}

function setRootUrl() { // use this in line 11
  getActiveTab().then((tabs) => {
    let tab = tabs[0];
		rootUrl = getSecLevelDomain(tab.url);
    return tab;
  });
}

function getSecLevelDomain(tabUrl){
  var url = new URL(tabUrl);
  url = url.hostname.split('.').splice(-2).join(".");
  return url;
}

function getActiveTab() {
  return browser.tabs.query({active: true, currentWindow: true});
}

function notifyPopupOfNewRequests(request) {
  //Could not establish connection. Receiving end does not exist.
  //differntiate between if popup open or not? or simply handleError
  var sending = browser.runtime.sendMessage({
    request: request
  });
  // sending.then(handleResponse, handleError);
}

setRootUrl();
// update when the tab is updated
browser.tabs.onUpdated.addListener(clearTab);
// update when the tab is activated
browser.tabs.onActivated.addListener(setRootUrl);

browser.webRequest.onSendHeaders.addListener(
  logRequest,
	{urls: ["<all_urls>"]},
  ["requestHeaders"]
);

browser.webRequest.onHeadersReceived.addListener(
    logResponse,
    {urls: ["<all_urls>"]},
    ["responseHeaders"]
);