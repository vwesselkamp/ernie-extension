/**
 * Gets the domain from a subdomain, as the library psl doesnt handle full URLS
 */
function getSecondLevelDomainFromDomain(url) {
    return psl.get(url); // look at a public suffix list and finds domains such as amazon.co.uk
}

/**
 * Gets the domain from a full URL string
 */
function getSecondLevelDomainFromUrl(tabUrl){
    const url = new URL(tabUrl);
    return getSecondLevelDomainFromDomain(url.hostname);
}

let backgroundFetches = [];

function tabIsUndefined(requestDetails) {
    /**
     * stores the responses to our background fetches in an array from where it should be retrievable for comparison
     */
    function storeBackgroundFetch() {
        if (requestDetails.tabId === -1) {
            if (requestDetails.responseHeaders) {
                backgroundFetches.push({
                    url: requestDetails.url,
                    cookies: requestDetails.responseHeaders.filter(header => header.name.toLowerCase() === "set-cookie")
                })
            }
        }
    }

    // this appears to happen a lot for Web Workers
    // I have no way of handling these, so I need to drop them
    // TODO: differentiate web workers from our background fetches
    if(tabs[requestDetails.tabId] === undefined){
        console.warn("Undefined tab for request " + requestDetails.url)
        storeBackgroundFetch();
        return true;
    }
}

/**
 * creates new Request object for each request the listener catches
 * @param requestDetails
 */
function logRequest(requestDetails) {
    if (tabIsUndefined(requestDetails)) return

    // fetch works much like a XHR request
    fetch(requestDetails.url,
        {
            // credentails: omit means that the cookies will neither be send nor set in the browser
            // this is why we need to retrieve the set cookies form our webRequest
            credentials: "omit"
        })
        .then(response => {
            // here the response should also be available through webRequest
            let request = new WebRequest(requestDetails);
        })
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

