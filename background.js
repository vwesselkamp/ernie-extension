var currentTab;
// stores all tabs by their tabId as index
var tabs = [];

/*
Class to keep track ov everything happening in a tab, until a new link is clicked or the site is refreshed
 */
class TabInfo {
  constructor(tab) {
    this.domain = getSecLevelDomain(tab.url)
    this.requests = [];
    this.responses = [];
  }
}

/*
  Superclass of all HTTP communication
 */
class HttpInfo{

  constructor(webRequest) {
    this.url = webRequest.url;
    this.tabId = webRequest.tabId;
    this.domain = getSecLevelDomain(webRequest.url);
    this.party = this.checkIfThirdParty(); // move this function into the object?
  }

  checkIfThirdParty(){
    if(this.domain !== tabs[this.tabId].domain){
      return "third";
    }
    return "first";
  }
}

/*
  Http request as reduced to the info we need.
 */
class RequestInfo extends HttpInfo{
  constructor(webRequest) {
    super(webRequest);
    this.header = webRequest.requestHeaders;
    this.cookies = this.extractCookie(this.header);
  }

  archive(tabId){
    tabs[tabId].requests.push(this);
    if (tabId === currentTab) {
      this.notifyPopupOfNewRequests(this); // only request are shown in the extension popup for now
    }
  }

  notifyPopupOfNewRequests(request) {
    //TODO: Could not establish connection. Receiving end does not exist.
    //differntiate between if popup open or not? or simply handleError
    var sending = browser.runtime.sendMessage({
      request: request
    });

    function handleError() {
      //TODO
    }

    function handleResponse() {
      //TODO
    }

    sending.then(handleResponse, handleError);
  }

  //for requests, all the cookies are send in one header attribute, if this is found, the cookies are extracted and returned
  extractCookie(header) {
    let cookies = [];
    header.forEach((attribute) => {
      if (attribute.name.toLowerCase() === "cookie") {
        cookies = this.extractCookieFromHeader(this.url, attribute.value);
      }
    })
    return cookies;
  }

  extractCookieFromHeader(url, headerCookies){
    let cookies = [];
    // cookies are seperated by ; and the values defined after the first =
    let result = headerCookies
        .split(';')
        .map(v => v.split(/=(.+)/)); // TODO: returns emptz string as third parameter for some reason
    result.forEach((cookie) => {
      cookies.push(new Cookie(url, cookie[0], cookie[1]));
    });
    return cookies;
  }
}

class ResponseInfo extends HttpInfo{
  constructor(webRequest) {
    super(webRequest);
    this.header = webRequest.responseHeaders;
    this.cookies = this.extractCookie(this.header);
  }

  archive(tabId){
    tabs[tabId].responses.push(this);
  }

  // in responses there can be mutiple set-coockies, they are collected and returned at once
  extractCookie(header) {
    let cookies = [];
    header.forEach((attribute) => {
      if (attribute.name.toLowerCase() === "set-cookie") {
        cookies.push(this.extractCookieFromHeader(this.url, attribute.value));
      }
    })
    return cookies;
  }

  extractCookieFromHeader(url, headerCookies){
    let result = headerCookies
        .split(';', 1)
        .map(v => v.split(/=(.+)/)); // returns emptz string as third parameter for some reason
    return new Cookie(url, result[0][0], result[0][1]); // TODO ??
  }
}

function Cookie(url, key, value){
  this.url = url;
  this.key = key;
  this.value = value;
}


function handleIrregularities(requestDetails) {
  if(tabs[requestDetails.tabId] === undefined){
    console.log("New Tab")
    initializeCleanTab(requestDetails.tabId);
  } else if (requestDetails.originUrl === undefined){ //TODO: when is this the case?
    console.log("undefined request info: " + requestDetails.url)
  }
}

function logRequest(requestDetails) {
  handleIrregularities(requestDetails);
  let request = new RequestInfo(requestDetails);
  request.archive(requestDetails.tabId);
}

function logResponse(responseDetails) {
  handleIrregularities(responseDetails);
  let response = new ResponseInfo(responseDetails);
  response.archive(responseDetails.tabId);
}


// new Tab after clicking link, reloading or after strtup
function initializeCleanTab(tabId) {
  browser.tabs.get(tabId).then((tab) => {
    tabs[tabId] = new TabInfo(tab);
  })
}


function clearTabsData(tabId, changeInfo, tabInfo){
  setCurrentTab();
  // if a new page call is made
  if(changeInfo.url && changeInfo.status == "loading") {
    initializeCleanTab(tabId)
    console.log("clearing " + tabInfo.url)
  }
}

function setCurrentTab() { // activeInfo also contains tabId
  getActiveTab().then((tabs) => {
    currentTab = tabs[0].id;
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


setCurrentTab();

function initializeAllTabs(tabs) {
  for (let tab of tabs) {
    initializeCleanTab(tab.id);
  }
}

// leaving it here because I don't know when these errors occur yet
function onError(error) {
  console.log(`Error: ${error}`);
}

let querying = browser.tabs.query({});
querying.then(initializeAllTabs, onError);

// update when the tab is loading something new
const clearFilter = {
  properties: ["status"]
}
browser.tabs.onUpdated.addListener(clearTabsData, clearFilter);
// update when the tab is activated
browser.tabs.onActivated.addListener(setCurrentTab);

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