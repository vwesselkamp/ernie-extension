/**
 * Enum like structure for the categories of tracking.
 * The key is what is used in the JS code, the value becomes a HTML class and is used in CSS for styling.
 * Needs to be a var to be accessible to the popup as well
 */
var Categories = Object.freeze({
    "BASICTRACKING":"tracking",
    "TRACKINGBYTRACKER":"trackbytrack",
    "NONE":"nothing"})

var Party = Object.freeze({
    "THIRD": true,
    "FIRST": false})
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

        // only after all information from the headers has been processed we assign a category and store the result
        //TODO: move this out of class?
        this.extractFromHeader(comparisonCookies).then(()=> {
            this.assignCategory();
            this.archive(this.browserTabId);
        });
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
     * This method is async so that the constructor can wait for it to finish before pushing it to the popup and the
     * TabInfo Class. This guarantees that all information about cookies and categories is already available when
     * someone accesses the object
     * @returns {Promise} whose content is unimportant, only relevant that it has finished
     */
    async extractFromHeader(comparisonCookies) {
        for (let attribute of this.header){
            this.findCookie(attribute);
            this.findContentType(attribute);
            this.findReferer(attribute);
        }
        // the extracted cookies are then checked for tracking behaviour
        if (comparisonCookies){
            let potential = []
            for(let comparisonCookie of comparisonCookies){
                potential.push(...this.parseSetCookie(comparisonCookie))
            }

            compareCookies.call(this, potential)

        }

        function compareCookies(potential) {
            for(let cookie of this.cookies){
                cookie.compareCookies(potential);
            }
        }

        return this.checkForSafeCookies()
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
                this.cookies.push(new Cookie(this.url, cookie[0].trim(), cookie[1]));
            }
        }
    }

    /**
     * Example:
     A3=d=AQABBOKubV8CEDpyvhY-1MerOzNL5rC-loAFEgEBAQEAb193XwAAAAAA_SMAAAcI4q5tX7C-loA&S=AQAAAkP0da8j3VEBAH0bHkie0e8;
     Max-Age=31557600; Domain=.yahoo.com; Path=/; SameSite=None; Secure; HttpOnly
     We are interested only in the first part which contains key=value; of the cookie
     Separate only at the first =
     There seems to be the option to have several cookies in the same "set-cookies" attribute, seperated by a , or
     by a line break.
     * @param attribute is the value of the header attribute
     * @returns {[]} the cookies from this attribute
     */
    parseSetCookie(attribute) {
        let collectedCookies = [];
        let lines = attribute.value.split("\n");
        for (let line of lines) {
            let result = line
                .split(';', 1)
                /*
                The following regex splits at every = that is followed by at least one character
                This way, only the first = is matched
                 */
                .map(v => v.split(/=(.+)/));
            collectedCookies.push(new Cookie(this.url, result[0][0], result[0][1]));
        }
        return collectedCookies;
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
     * Sets all "safe" cookies from our database.
     * Wraps the callback function of the DB query into a Promise so that the constructor can wait for its completion
     * before continuing.
     * The query is performed for an URL instead of each cookie like before. That way when we use the cursor to travers
     * the result of the query we can change the attribute of each cookie for a whole request.
     * @returns {Promise}
     */
    checkForSafeCookies(){
        return new Promise((resolve, reject) => {
            // index over the domains of the safe cookies
            const cookieIndex = db.transaction(["cookies"]).objectStore("cookies").index("url");
            // filters all safe cookies for the request url
            const indexRange = IDBKeyRange.only(getSecondLevelDomainFromUrl(this.url));
            let idbRequest = cookieIndex.openCursor(indexRange);

            // context changes in callback function, so save current request in var
            let request = this;
            /**
             * TODO: find a way to extract this method
             * For each safe cookie from our query result, check if the same cookie was send in our request
             * @param queryResult contain all safe cookies from the domain of our request
             */
            idbRequest.onsuccess = function(queryResult) {
                const cursor = queryResult.target.result;
                if (cursor) {
                    for (let cookie of request.cookies) {
                        //call() allows to define the content of "this" in the called method
                        cookie.setIfIdCookie.call(cookie, cursor.value.key)
                    }
                    cursor.continue();
                } else {
                    // reached the end of the cursor so we exit the callback function and can resole the promise at the
                    // same time
                    resolve(request.cookies)
                }
            };
            idbRequest.onerror = event=> reject(event)
        });
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
        for (const redirect of redirects) {
            if (redirect.origin !== this.domain && tabs[this.browserTabId].isTracker(redirect.origin)) {
                console.info("Redirect origin " + redirect.origin + " for " + this.url + " is a tracker")
                return true;
            }
        }
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
        this.url = url;
        this.key = key;
        this.value = value;
        this.identifying = false; // cookie default to being non identifying
    }

    setIfIdCookie(key){
        if (key === this.key) {
            this.identifying = false;
            console.info("Found safe cookie for " + this.url + ": " + this.key);
        }
    }

    compareCookies(comparisonCookies){
        for(let cookie of comparisonCookies){
            if(cookie.key === this.key) {
                if (cookie.value !== this.value) {
                    console.info("Found id cookie for " + this.url + ": " + this.key);
                    this.identifying = true;
                }
            }
        }
    }
}