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

/**
 * Since we send a second request for each request we send, but its send via fetch() from the background script,
 * the Tab ID of the reqeust will be -1, as it is not assigned to an actual tab.
 * Through this we can catch all the background requests, and send an alert via a CustomEvent to the waiting request/
 * response handlers.
 * @param requestDetails
 * @returns {boolean}
 */
function tabIsUndefined(requestDetails) {
    /**
     * Sends out an event for each response to a background fetch
     * The Custom Event allows for the cookies to be send directly in the event, instead of saving and retrieving them
     * at another point.
     * Often suggested to use in this context were Proxies. If the events turn out not to work, that might be worth
     * a look at.
     * Since we send an anonymous fetch without cookies, we should receive some set-cookie headers in the response,
     * which we can compare to those in our regular request to see if they might be identifying
     */
    function alertOfBackgroundFetchResponse() {
        if (requestDetails.responseHeaders) {
            const event = new CustomEvent(requestDetails.url,{
                detail: requestDetails.responseHeaders.filter(header => header.name.toLowerCase() === "set-cookie")
            });
            dispatchEvent(event);
        }
    }


    // TODO: differentiate web workers from our background fetches
    // webworkers also tend to have a tabId of -1 for their requests, but I suppose it doesn't matter if we shoot that
    // response into the void
    if(requestDetails.tabId < 0){
        alertOfBackgroundFetchResponse();
        return true;
    } else if(tabs[requestDetails.tabId] === undefined){    // this appears to happen a lot for Web Workers
        console.warn("Undefined tab for request " + requestDetails.url)
        return true;
    }
}

/**
 * Creates new Request object for each request the listener catches
 * To be able to see which cookies are identifying, another, anonymous, fetch request is executed upon receiving the response for this
 * request. On receiving the response to that background request, we can extract the cookies that are to be set on a clean browser
 * and we can compare these to the ones we already have in our regular request. If host and key are the same for two cookies
 * but value is different, we can strongly assume that that cookie can be used for identifying the user.
 * @param requestDetails
 */
function logRequest(requestDetails) {
    /**
     * This function only creates the request object when the corresponding answer is available
     * @param event on the URL of the request
     */
    function createRequest(event) {
        eventTriggered = true;
        let request = new WebRequest(requestDetails, event.detail);
        removeEventListener(requestDetails.url, createRequest);
    }


    if (tabIsUndefined(requestDetails)) return // most likely a background request
    // if a original request, we need to wait or the response of the background request
    addEventListener(requestDetails.url, createRequest, false);

    let eventTriggered = false;
    /*
    Since the fetch is only send after the response to this request has been received, the timeout is set directly
    to remove the listener in case no response came.
    For initial requests, that didn't get a response therefore, no second request is send. But it is highly unlikely that
    that second request would have gotten a response anyway.
     */
    setTimeout(() => {
        if(!eventTriggered){
            removeEventListener(requestDetails.url, createRequest);
            console.warn("Removed Request listener for " + requestDetails.url)
            let request = new WebRequest(requestDetails);
        }
    }, 10000); //TODO: is this timeout appropriate?

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
 * Creates new Response object for each request the listener catches
 * To be able to see which cookies are identifying, another, anonymous, fetch request is executed upon receiving the response for this
 * request. On receiving the response to that background request, we can extract the cookies that are to be set on a clean browser
 * and we can compare these to the ones we already have in our regular request. If host and key are the same for two cookies
 * but value is different, we can strongly assume that that cookie can be used for identifying the user.
 * @param responseDetails
 */
function logResponse(responseDetails) {
    /**
     * This function only creates the response object when the corresponding answer is available
     * @param event on the URL of the request
     */
    function createResponse(event) {
        eventTriggered = true;
        let response = new Response(responseDetails, event.detail);
        removeEventListener(responseDetails.url, createResponse);
    }

    /**
     * Fetches the same resource again, but with no cookies send.
     */
    function sendAnonymousBackgroundRequest() {
        // fetch works much like a XHR request
        // in addition to the resource URL, in init additional headers can be set/changed
        fetch(responseDetails.url,
            {
                /*
                credentials: omit means that the cookies will neither be send nor set in the browser
                this is why we need to retrieve the set-cookie from our webRequest
                no-cache on the other hand is set, so that our background request will in any case contact the server
                and not fetch the resource simply from the browser cache.
                no-cache: contact the server if resource still up to date, retrieve it and cache it if there is a new version
                no-store: dont look at the cache, retrieve the resource, and dont cache the resource after retrieval
                */
                method: responseDetails.method,
                credentials: "omit",
                cache: "no-cache"
            })
            .then(response => {
                // removes the event handler if no answer came after 5 seconds
                setTimeout(() => {
                    if (!eventTriggered) {
                        removeEventListener(responseDetails.url, createResponse);
                        console.warn("Removed Response listener for " + responseDetails.url)
                        let response = new Response(responseDetails);
                    }
                }, 10000); //TODO: is this timeout appropriate?
            })
            .catch(error => {
              console.warn(error)
              console.log(responseDetails.url);
              removeEventListener(responseDetails.url, createResponse);
              console.log("Removed listener due to network error " + responseDetails.url)
            })
    }

    if (tabIsUndefined(responseDetails)) return // drop the background requests as we dont want to work with them further
    // if a original request, we need to wait or the response of the background request
    if (!responseDetails.fromCache){
      addEventListener(responseDetails.url, createResponse, false);

      let eventTriggered = false;

      sendAnonymousBackgroundRequest();
    }
}

/*
onHeadersReceived is the first event triggered for a response, and already contains all information we need
TODO: onHeadersReceived is sometimes triggered twice.
onResponseStarted isn't, but is triggered only at the end of a redirect chain
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
            originUrl: responseDetails.url,
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
