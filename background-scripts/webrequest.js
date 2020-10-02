/**
 * Enum like structure for the categories of tracking.
 * The key is what is used in the JS code, the value becomes a HTML class and is used in CSS for styling.
 * Needs to be a var to be accessible to the popup as well
 */
var Categories = Object.freeze({
    "BASICTRACKING":"tracking",
    "TRACKINGBYTRACKER":"trackbytrack",
    "NONE":"nothing",
    "SYNCING":"syncing"
})

/**
 * Request class and superclass for all HTTP communication
 * As there is no such thing as an abstract class in JS, the deviating methods for response are only overwritten
 */
class WebRequest{
    constructor(webRequest, comparisonCookies) {
        this.url = webRequest.url; //string with all parameters
        this.browserTabId = webRequest.tabId; // id of the open browser tab
        this.id = webRequest.requestId;
        this.domain = getSecondLevelDomainFromUrl(webRequest.url); //inline?
        //not possible to inline this, because when sending it as a runtime message to the popup script, the methods are no longer available
        this.thirdParty = this.isThirdParty();
        this.header = this.setHeader(webRequest);
        this.cookies = [];
        this.category = Categories.NONE;
        this.urlSearchParams = (new URL(this.url)).searchParams

        // only after all information from the headers has been processed we assign a category and store the result
        //TODO: move this out of class?
        this.extractFromHeader(comparisonCookies)
        // the extracted cookies are then checked for tracking behaviour
        this.findIdCookies(comparisonCookies);
        this.assignCategory();
        this.archive(this.browserTabId);
    }

    /**
     * this is here so it can be overwritten for the Response Class, where the header attribute is named differently
     */
    setHeader(webRequest) {
        return webRequest.requestHeaders;
    }

    /**
     * this returns the strings that are later used as classes in the HTML code
     * @returns {boolean} that describes type of request
     */
    isThirdParty(){
        // compares request domain to main domain of the whole tab
        return this.domain !== tabs[this.browserTabId].domain;
    }

    /**
     * Parses each header attribute and extracts the relevant ones
     */
    extractFromHeader(comparisonCookies) {
        for (let attribute of this.header){
            this.findCookie(attribute);
            this.findContentType(attribute);
            this.findReferer(attribute);
        }
    }

    /**
     * extracts all cookies from the cookie header
     * for requests, all the cookies are send in one header attribute
     */
    findCookie(attribute){
        if (attribute.name.toLowerCase() === "cookie") {
            // cookies are seperated by ; and the values defined after the first =
            // they cannot contain spaces or ;
            let rawCookies = attribute.value
                .split(';')
                .map(v => v.split(/=(.+)/));
            for (let cookie of rawCookies) {
                //trims of white spaces at the edges of the key, which are left over from the regex
                this.cookies.push(new Cookie(this.url, cookie[0].trim(), cookie[1].trim()));
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
     * If we could collect set-cookie headers from the anonymous second background request, we can parse them here
     * and compare them with the cookies from the original request. If a cookie matches completely, we know that it is
     * not identifying, but if we find one that differs in value, it can be used to track
     * @param comparisonCookies
     */
    findIdCookies(comparisonCookies) {
        if (comparisonCookies) {
            let parsedComparisonCookies = []
            for (let comparisonCookie of comparisonCookies) {
                parsedComparisonCookies.push(...this.parseSetCookie(comparisonCookie))
            }
            compareWithRequestCookies.call(this, parsedComparisonCookies)

        }

        function compareWithRequestCookies(parsedComparisonCookies) {
            for (let cookie of this.cookies) {
                cookie.compareCookiesFromBackgroundRequest(parsedComparisonCookies);
            }
        }
    }

    /**
     * Example:
     A3=d=AQABBOKubV8CEDpyvhY-1MerOzNL5rC-loAFEgEBAQEAb193XwAAAAAA_SMAAAcI4q5tX7C-loA&S=AQAAAkP0da8j3VEBAH0bHkie0e8;
     Max-Age=31557600; Domain=.yahoo.com; Path=/; SameSite=None; Secure; HttpOnly
     We are interested only in the first part which contains key=value; of the cookie
     Separate only at the first =
     TODO: There seems to be the option to have several cookies in the same "set-cookies" attribute, seperated by a , or
     by a line break.
     * @param headerAttribute is the value of the header attribute
     * @returns {[]} the cookies from this attribute
     */
    parseSetCookie(headerAttribute) {
        let collectedCookies = [];
        // Line break occurred on walmart.com, and firefox recognizes it, even though it doesn't seem conform to the standard
        let lines = headerAttribute.value.split("\n");
        for (let line of lines) {
            let result = line.split(';', 1)
            /*
            The following regex splits at every = that is followed by at least one character
            This way, only the first = is matched
             */
            result = result[0].split(/=(.+)/);
            try{
                collectedCookies.push(new Cookie(this.url, result[0].trim(), result[1].trim()));
            } catch (e){
                console.warn(e);
                console.log("Parsed cookie: " + result[0] + " " + result[1])
                console.log("Line: " + line)
            }
        }
        return collectedCookies;
    }

    assignCategory() {
        // third party requests with identifying cookies
        if(this.isBasicTracking()){
            this.category = Categories.BASICTRACKING;
        }
        // the referers domain has tracked on this website before
        // and the request itself is tracking
        if(this.isTrackingInitiatedByTracker()){
            this.category = Categories.TRACKINGBYTRACKER
        }

        if(this.isCookieSyncing()){
            this.category = Categories.SYNCING
        }
    }

    /**
     * Category "Basic Tracking" is fulfilled when the request is a third party request and there are identifying cookies
     */
    isBasicTracking() {
        return this.thirdParty && this.cookies.filter(cookie => cookie.identifying === true).length > 0
    }

    /**
     * Checks if either the referer of a request is a tracker or if the request has been a redirect from a tracker
     * If either is the case and the request itself is a tracking request, it is classified into Cat. II
     */
    isTrackingInitiatedByTracker() {
        // can only be a "tracking request initiated by another tracker" if it is also a basic tracking request
        if(this.category === Categories.BASICTRACKING){
            // check both options for initiation
            if(this.isInitiatedByReferer.call(this) || this.isInitiatedByRedirect.call(this)){
                return true;
            }
        }
    }

    /**
     * If the referal happens from another domain, it is checked if that domain is another tracker
     */
    isInitiatedByReferer() {
        if (this.referer && this.domain !== this.referer) {
            // TODO: refactor this into something with a consistent order
            // if this is the first tracking request made from this domain, the domain has not yet been initialized
            if (tabs[this.browserTabId].isTracker(this.referer)) {
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
    isInitiatedByRedirect() {
        let redirects = tabs[this.browserTabId].getRedirectsIfExist(this.id);
        if(redirects){
            for (const redirect of redirects) {
                if (redirect.origin !== this.domain && tabs[this.browserTabId].isTracker(redirect.origin)) {
                    console.info("Redirect origin " + redirect.origin + " for " + this.url + " is a tracker")
                    return true;
                }
            }
        }
    }

    isCookieSyncing() {
        let redirects = tabs[this.browserTabId].getRedirectsIfExist(this.id);
        if(redirects) {

            let directPredecessor = redirects.find(redirect => redirect.destination === this.url);
            if(directPredecessor){
              console.log("FOR URL: " + this.url)
                console.log(directPredecessor)
                try{
                  let preCookies = tabs[this.browserTabId].getCorrespondingRequest(directPredecessor.id, directPredecessor.originUrl).cookies;
                  for(let preCookie of preCookies){
                    for(var value of this.urlSearchParams.values()) {
                      if(value === preCookie.value){
                        console.log(preCookie);
                        return true;
                      }
                    }
                  }
                } catch (e){
                  console.log(e);
                  console.log(tabs[this.browserTabId].requests.filter(request => request.id == this.id));
                }
                // for (let param of this.urlSearchParams) {
                //     console.log(param)
                // }
            }
        }
        return false;
    }
    /**
     * If the popup is currently open, it receives all new requests added to the Tab object, so that it doesn't have
     * to retrieve the data from the background pages itself.
     * These are send as a runtime message.
     * @param request
     */
    notifyPopupOfNewRequests(request) {
        const sending = this.constructMessageToPopup(request);

        sending
            .then()
            .catch(function (error) {
                // All requests are send, but can only be received if popup is open. This error is a result of this.
                // We can just drop it
                if(error.toString().includes("Could not establish connection. Receiving end does not exist.")){
                    return;
                }
                // Any error printed from here is likely because the popup expected another format from the message
                console.error(error);
            });
    }

    /**
     * Sends the request and
     * @returns {Promise<any>} that can be used to extract the answer. As the popup doesn't answer we don't care
     * about resolving
     */
    constructMessageToPopup(request) {
        return browser.runtime.sendMessage({
            request: request
        });
    }

    /**
     * Stores the constructed object in Tab object of the corresponding tab and forwards it to the popup if necessary
     */
    archive(){
        tabs[this.browserTabId].storeWebRequest(this);
        // if this request has been found to be tracking, mark its domain as a tracker
        if(this.category !== Categories.NONE){
            tabs[this.browserTabId].markDomainAsTracker(this.domain);
        }
        // if this request belongs to the open tab, send it to the popup
        if (this.browserTabId === currentTab) {
            this.notifyPopupOfNewRequests(this);
        }
    }


}


/**
 * Response class handles deviating behaviour from the requests
 */
class Response extends WebRequest{
    /**
     * header attribute is called responseHeaders in responses
     */
    setHeader(webRequest) {
        return webRequest.responseHeaders;
    }

    /**
     * Extracts cookies from the "set-cookie" attribute
     * For one responses there can be several of these "set-cookie" attributes, but each one only contains one cookie
     */
    findCookie(attribute){
        if (attribute.name.toLowerCase() === "set-cookie") {
            this.cookies.push(...this.parseSetCookie(attribute));
        }
    }


    /**
     * @override see same method in WebRequest
     */
    constructMessageToPopup(response) {
        return browser.runtime.sendMessage({
            response: response
        });
    }

    /**
     * @override see checkTrackByTrack in WebRequest
     */
    isTrackingInitiatedByTracker() {
        // can only be a "tracking request initiated by another tracker" if it is also a basic tracking request
        if(this.category === Categories.BASICTRACKING){
            // only proceed if corresponding request exists and can be evaluated
            let request = tabs[this.browserTabId].getCorrespondingRequest(this.id, this.url);
            if(!request){
                console.warn("No corresponding request found for this response");
                return false;
            }
            // check both options for initiation
            // in the case of responses, the initiation happens for the corresponding request
            if(this.isInitiatedByReferer.call(request) || this.isInitiatedByRedirect.call(request)){
                return true;
            }
        }
        return false;
    }
}

/**
 * Data about each cookie is stored in this class
 */
class Cookie{
    constructor (url, key, value) {
        this.url = url; //string with all parameters
        this.key = key;
        this.value = value;
        this.identifying = false; // cookie default to being non identifying
    }

    /**
     * For all the cookies from the background request, check if the key is the same (so same cookie)
     * but value is different (so identifying possible)
     * @param comparisonCookies from background reqeust
     */
    compareCookiesFromBackgroundRequest(comparisonCookies){
        for (let cookie of comparisonCookies){
            if(cookie.key === this.key) {
                if (cookie.value !== this.value) {
                    console.info("Found id cookie for " + this.url + ": " + this.key);
                    this.identifying = true;
                }
            }
        }
    }
}
