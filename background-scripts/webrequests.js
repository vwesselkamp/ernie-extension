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
    console.log(requestDetails.requestId + " " + requestDetails.url)
    if(handleIrregularities(requestDetails)) { return };
    let request = new RequestInfo(requestDetails);
}

function logResponse(responseDetails) {
    console.log(responseDetails.requestId + " " + responseDetails.url)

    if(handleIrregularities(responseDetails)) { return };
    let response = new ResponseInfo(responseDetails);
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


function logRedirect(responseDetails) {
    console.warn(responseDetails.requestId + " " + responseDetails.url)
    console.log(responseDetails.redirectUrl);
}

browser.webRequest.onBeforeRedirect.addListener(
    logRedirect,
    {urls: ["<all_urls>"]}
);