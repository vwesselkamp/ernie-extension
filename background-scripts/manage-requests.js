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

function tabIsUndefined(requestDetails) {
    /**
     * stores the responses to our background fetches in an array from where it should be retrievable for comparison
     */
    function storeBackgroundFetch() {
        if (requestDetails.tabId === -1) {
            if (requestDetails.responseHeaders) {
                const event = new CustomEvent(requestDetails.url,{
                    detail: requestDetails.responseHeaders.filter(header => header.name.toLowerCase() === "set-cookie")
                });
                dispatchEvent(event);
            }
        }
    }

    // this appears to happen a lot for Web Workers
    // I have no way of handling these, so I need to drop them
    // TODO: differentiate web workers from our background fetches
    if(tabs[requestDetails.tabId] === undefined){
        console.info("Undefined tab for request " + requestDetails.url)
        storeBackgroundFetch();
        return true;
    }
}

/**
 * creates new Request object for each request the listener catches
 * @param requestDetails
 */
function logRequest(requestDetails) {
    /**
     * This function only creates the request object when the corresponding answer is available
     * @param e
     */
    function createRequest(e) {
        eventTriggered = true;
        let request = new WebRequest(requestDetails, e.detail);
        removeEventListener(requestDetails.url, createRequest);
    }


    if (tabIsUndefined(requestDetails)) return
    addEventListener(requestDetails.url, createRequest, false);

    let eventTriggered = false;

    // fetch works much like a XHR request
    fetch(requestDetails.url,
        {
            // credentials: omit means that the cookies will neither be send nor set in the browser
            // this is why we need to retrieve the set-cookie from our webRequest
            method: requestDetails.method,
            credentials: "omit",
            cache: "no-cache"
        })
        .then(response => {
            // removes the event handler if no answer came after 5 seconds
            setTimeout(() => {
                if(!eventTriggered){
                    removeEventListener(requestDetails.url, createRequest);
                    console.warn("removed listener for " + requestDetails.url)
                    let request = new WebRequest(requestDetails);
                }
            }, 5000); //TODO: is this timeout appropriate?
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
    if (responseDetails.tabId < 0) return
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

