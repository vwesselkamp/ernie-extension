function getSecondLevelDomainFromDomain(url) {
    return psl.get(url); // look at a public suffix list and finds domains such as amazon.co.ukA
}

function getSecondLevelDomainFromUrl(tabUrl){
    const url = new URL(tabUrl);
    return getSecondLevelDomainFromDomain(url.hostname);
}

// Enum like structure for the categories of tracking
var Categories = Object.freeze({
    "BASICTRACKING":"tracking",
    "TRACKINGBYTRACKER":"trackbytrack",
    "NONE":"nothing"})


/*
  Superclass of all HTTP communication
 */
class HttpInfo{

    constructor(webRequest) {
        this.url = webRequest.url;
        this.tabId = webRequest.tabId;
        this.id = webRequest.requestId;
        this.domain = getSecondLevelDomainFromUrl(webRequest.url); //inline?
        this.party = this.checkIfThirdParty(); //inline?
        this.header = this.setHeader(webRequest);
        this.cookies = [];
        this.category = Categories.NONE;

        // only after all information from the headers has been processed we assign a category and store the result
        this.extractFromHeader(this.header).then(()=> {
            this.assignCategory();
            this.archive(this.tabId);
        });
    }

    /**
     * this is here so it can be overwritten for the Response Class, where the header attribute is named differently
     */
    setHeader(webRequest) {
        return webRequest.requestHeaders;
    }

    checkIfThirdParty(){
        if(this.domain !== tabs[this.tabId].domain){
            return "third";
        }
        return "first";

    }

    /**
     * Parses each header attribute and extracts the relevant ones
     * This method is async so that the constructor can wait for it to finish before pushing it to the popup and the
     * TabInfo Class. This guarantees that all information about cookies and categories is already available when
     * someone accesses the object
     * @param header
     * @returns {Promise} whose content is unimportant, only relevant that it has finished
     */
    async extractFromHeader(header) {
        for (let i in header){
            this.findCookie(header[i]);
            this.findContentType(header[i]);
            this.findReferer(header[i]);
        }
        return this.checkForSafeCookies()
    }

    //for requests, all the cookies are send in one header attribute, if this is found, the cookies are extracted and returned
    findCookie(attribute){
        if (attribute.name.toLowerCase() === "cookie") {
            // cookies are seperated by ; and the values defined after the first =
            let result = attribute.value
                .split(';')
                .map(v => v.split(/=(.+)/)); // TODO: returns emptz string as third parameter for some reason
            for (let i in result) {
                this.cookies.push(new Cookie(this.url, result[i][0].trim(), result[i][1]));
            }
        }
    }

    findContentType(attribute){
        if (attribute.name.toLowerCase() === "content-type"){
            this.contentType = attribute.value;
        }
    }

    findReferer(attribute) {
        if (attribute.name.toLowerCase() === "referer"){
            this.referer = getSecondLevelDomainFromUrl(attribute.value);
        }
    }

    /**
     *
     * @returns {Promise<unknown>}
     */
    checkForSafeCookies(){
        let request = this;
        var cookieIndex = db.transaction(["cookies"]).objectStore("cookies").index("url");

        // this is not an elegant solution, however i simply dont understand how onsuccess is assigned
        var indexRange = IDBKeyRange.only(getSecondLevelDomainFromUrl(this.url));
        return new Promise((resolve, reject) => {
            let idbRequest = cookieIndex.openCursor(indexRange)
            idbRequest.onsuccess = function(event) {
                var cursor = event.target.result;
                if (cursor) {
                    for (let i in request.cookies) {
                        //TODO; fix this with "this" magic
                        request.cookies[i].checkIfIdCookie(request.cookies[i], cursor.value.key)
                    }
                    cursor.continue();
                } else {
                    resolve(request.cookies)
                }
            };
            idbRequest.onerror = event=> reject(event)
        })
    }


    //TODO: fix the this issue
    assignCategory() {
        // third party requests with identifying cookies
        this.checkBasicTracking();
        // the referers domain has tracked on this website before
        // and the request itself is tracking
        this.checkTrackByTrack();
    }

    checkBasicTracking() {
        const localFilter = this.filterIdCookies.bind(this);
        if (this.party === "third" && localFilter().length > 0) {
            this.category = Categories.BASICTRACKING;
        }
    }

    /**
     * Checks if either the referer of a request is a tracker or if the request has been a redirect from a tracker
     * If either is the case and the request itself is a tracking request, it is classified into Cat. II
     */
    checkTrackByTrack() {
        // can only be a "tracking request initiated by another tracker" if it is also a basic tracking request
        if(this.category === Categories.BASICTRACKING){
            // check both options for initiation
            if(this.checkIfInitiatedByReferer.call(this) || this.checkIfInitiatedByRedirect.call(this)){
                this.category = Categories.TRACKINGBYTRACKER
            }
        }
    }

    /**
     * If the referal happens from another domain, it is checked if that domain is another tracker
     */
    checkIfInitiatedByReferer() {
        if (this.referer && this.domain !== this.referer) {
            // TODO: refactor this into something with a consistent order
            // if this is the first tracking request made from this domain, the domain has not yet been initialized
            if (tabs[this.tabId].checkIfTracker(this.referer)) {
                console.info("Referer " + this.referer + " of " + this.url + " is tracker")
                return true;
            }
        }
    }

    /**
     * Gets whole redirect chain unordered, and checks each element
     * If any redirect domains in the redirect chain have been classified as a tracker, this request is a tracking
     * request initiated by antoher tracker
     */
    checkIfInitiatedByRedirect() {
        let redirects = tabs[this.tabId].getRedirectsIfExists(this.id);
        for (const redirect of redirects) {
            if (tabs[this.tabId].checkIfTracker(redirect.origin)) {
                console.info("Redirect origin " + redirect.origin + " for " + this.url + " is a tracker")
                return true;
            }
        }
    }


    filterIdCookies() {
        return this.cookies.filter(function (cookie) {
            return cookie.identifying === true;
        });
    }

    notifyPopupOfNewRequests(request) {
        var sending = browser.runtime.sendMessage({
            request: request
        });

        sending
            .then()
            .catch(function (error) {
                if(error.toString().includes("Could not establish connection. Receiving end does not exist.")){
                    return;
                }
                console.error(`Error: ${error}`);
            });
    }

}

/*
  Http request as reduced to the info we need.
 */
class RequestInfo extends HttpInfo{

    archive(tabId){
        tabs[tabId].requests.push(this);
        tabs[tabId].pushWebRequest(this);
        if(this.category !== Categories.NONE){
            tabs[tabId].setTracker(this.domain);
        }
        if (tabId === currentTab) {
            this.notifyPopupOfNewRequests(this); // only request are shown in the extension popup for now
        }
    }

}

class ResponseInfo extends HttpInfo{

    setHeader(webRequest) {
        return webRequest.responseHeaders;
    }

    archive(tabId){
        tabs[tabId].responses.push(this);
        tabs[tabId].pushWebRequest(this);
        if(this.category !== Categories.NONE){
            tabs[tabId].setTracker(this.domain);
        }
        if (tabId === currentTab) {
            this.notifyPopupOfNewRequests(this);
        }
    }

    // for responses there can be several header attributes set cookies
    findCookie(attribute){
        if (attribute.name.toLowerCase() === "set-cookie") {
            let result = attribute.value
                .split(';', 1)
                .map(v => v.split(/=(.+)/));
            this.cookies.push(new Cookie(this.url, result[0][0], result[0][1]));
        }
    }

    notifyPopupOfNewRequests(response) {
        var sending = browser.runtime.sendMessage({
            response: response
        });

        sending
            .then()
            .catch(function (error) {
                if(error.toString().includes("Could not establish connection. Receiving end does not exist.")){
                    return;
                }
                console.error(`Error: ${error}`);
            });
    }

    /**
     * @override
     */
    checkTrackByTrack() {
        // can only be a "tracking request initiated by another tracker" if it is also a basic tracking request
        if(this.category === Categories.BASICTRACKING){
            // only proceed if corresponding request exists and can be evaluated
            let request = tabs[this.tabId].getCorrespondingRequest(this.id, this.url);
            if(!request){
                console.warn("No corresponding request found for this response");
                return;
            }
            // check both options for initiation
            // in the case of responses, the initiation happens for the corresponding request
            if(this.checkIfInitiatedByReferer.call(request) || this.checkIfInitiatedByRedirect.call(request)){
                this.category = Categories.TRACKINGBYTRACKER
            }
        }
    }
}


class Cookie{
    constructor (url, key, value) {
        this.url = url;
        this.key = key;
        this.value = value;
        this.identifying = true;
    }

    checkIfIdCookie(cookie, key){
        if (key === cookie.key) {
            cookie.identifying = false;
            console.info("Found safe cookie for " + cookie.url + ": " + cookie.key);
        }
    }
}