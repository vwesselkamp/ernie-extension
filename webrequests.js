function handleIrregularities(requestDetails) {
    if(tabs[requestDetails.tabId] === undefined){
        console.warn("Undefined tab for request " + requestDetails.url)
        return true;
    } else if (requestDetails.originUrl === undefined) { //TODO: when is this the case?
        console.group("undefined origin info: " + requestDetails.url)
        console.warn("origin " + requestDetails.originUrl + "   document " + requestDetails.documentUrl)
        console.groupEnd();
        return false;
    }
}

function logRequest(requestDetails) {
    if(handleIrregularities(requestDetails)) { return };
    let request = new RequestInfo(requestDetails);
    request.archive(requestDetails.tabId);
}

function logResponse(responseDetails) {
    if(handleIrregularities(responseDetails)) { return };
    let response = new ResponseInfo(responseDetails);
    response.archive(responseDetails.tabId);
}

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