function getSecondLevelDomainFromDomain(url) {
    return psl.get(url); // look at a public suffix list and finds domains such as amazon.co.ukA
}

function getSecondLevelDomainFromUrl(tabUrl){
    const url = new URL(tabUrl);
    return getSecondLevelDomainFromDomain(url.hostname);
}


function tabIsUndefined(requestDetails) {
    // this appears to happen a lot for Web Workers
    // I have no way of handling these, so I need to drop them
    if(tabs[requestDetails.tabId] === undefined){
        console.warn("Undefined tab for request " + requestDetails.url)
        return true;
    }
}

/**
 * creates new Request object for each request the listener catches
 * @param requestDetails
 */
function logRequest(requestDetails) {
    if(tabIsUndefined(requestDetails)) { return };
    let request = new WebRequest(requestDetails);
}

/*
onSendHeaders is triggered just when a the request headers are send. It's the last event triggered for a request,
which is where the most information about the request is available
 */
browser.webRequest.onSendHeaders.addListener(
    logRequest,
    {urls: ["<all_urls>"]},
    ["requestHeaders"] //needs to be set so that the requestHeaders are included
);

/**
 *  creates new Response object for each request the listener catches
 * @param responseDetails
 */
function logResponse(responseDetails) {
    if(tabIsUndefined(responseDetails)) { return };
    let response = new Response(responseDetails);
}

/*
onHeadersReceived is the first event triggered for a response, and already contains all information we need
 */
browser.webRequest.onHeadersReceived.addListener(
    logResponse,
    {urls: ["<all_urls>"]},
    ["responseHeaders"]
);

/**
 * logs all redirects the listener catches
 * @param responseDetails
 */
function logRedirect(responseDetails) {
    tabs[responseDetails.tabId].addRedirect(
        {id: responseDetails.requestId,
            origin: getSecondLevelDomainFromUrl(responseDetails.url),
            destination: responseDetails.redirectUrl}
    );
}

/*
onBeforeRedirect is triggered just before a redirect is executed. This means, that following on this event there will be
another onSendHeaders event triggered. The ID of the request stays constant over all redirect
 */
browser.webRequest.onBeforeRedirect.addListener(
    logRedirect,
    {urls: ["<all_urls>"]}
);