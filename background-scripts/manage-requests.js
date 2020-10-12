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

/*
onSendHeaders is triggered just when a the request headers are send. It's the last event triggered for a request,
which is where the most information about the request is available
 */
browser.webRequest.onSendHeaders.addListener(
    browserTabs.logRequest.bind(browserTabs),
    {urls: ["<all_urls>"]},
    ["requestHeaders"] //needs to be set so that the requestHeaders are included
);

/*
onHeadersReceived is the first event triggered for a response, and already contains all information we need
 */
browser.webRequest.onHeadersReceived.addListener(
    browserTabs.logResponse.bind(browserTabs),
    {urls: ["<all_urls>"]},
    ["responseHeaders"]
);

/*
onBeforeRedirect is triggered just before a redirect is executed. This means, that following on this event there will be
another onSendHeaders event triggered. The ID of the request stays constant over all redirect
 */
browser.webRequest.onBeforeRedirect.addListener(
    browserTabs.logRedirect.bind(browserTabs),
    {urls: ["<all_urls>"]}
);
