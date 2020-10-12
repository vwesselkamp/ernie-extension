/**
 * Enum like structure for the categories of tracking.
 * The key is what is used in the JS code, the value becomes a HTML class and is used in CSS for styling.
 * Needs to be a var to be accessible to the popup as well
 */
var Categories = Object.freeze({
    "BASICTRACKING":"tracking",
    "TRACKINGBYTRACKER":"trackbytrack",
    "NONE":"nothing",
    "3rd-SYNCING":"third-syncing",
    "1st-SYNCING":"first-syncing",
    "FORWARDING": "forwarding",
    "ANALYSIS": "analysis"
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

        // we process all information from headers and store the request
        // only later we can analyze it
        this.extractFromHeader(comparisonCookies);
        this.predecessor = this.getPredecessor();
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
        return this.domain !== browserTabs.getTab(this.browserTabId).domain;
    }

    /**
     * Parses each header attribute and extracts the relevant ones
     */
    extractFromHeader() {
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
                if(cookie[1]){
                    this.cookies.push(new Cookie(this.url, cookie[0].trim(), cookie[1].trim(), SEND));
                } else {
                    this.cookies.push(new Cookie(this.url, cookie[0].trim(), "", SEND));
                }
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
            this.completeReferer = attribute.value;
        }
    }

    get referer(){
        if(this.completeReferer){
            return getSecondLevelDomainFromUrl(this.completeReferer);
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
                if(result[1]){
                    collectedCookies.push(new Cookie(this.url, result[0].trim(), result[1].trim(), SET));
                } else {
                    collectedCookies.push(new Cookie(this.url, result[0].trim(), "", SET));
                }
            } catch (e){
                console.warn(e);
                console.log("Parsed cookie: " + result[0] + " " + result[1])
                console.log("Line: " + line)
            }
        }
        return collectedCookies;
    }


    setTrackingByTracker() {
        if (this.isTrackingInitiatedByTracker()) {
            this.category = Categories.TRACKINGBYTRACKER
        }
    }

    setBasicTracking(request) {
        console.log(request)
        console.log(this)

        if (request.isBasicTracking()) {
            request.category = Categories.BASICTRACKING;
            browserTabs.getTab(request.browserTabId).markDomainAsTracker(request.domain);
            console.log(request.category)
            return false;
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
            return this.isInitiatedByPredecessor.call(this);
        }
    }

    /**
     * Gets whole redirect chain unordered, and checks each element
     * If any redirect domains in the redirect chain have been classified as a tracker, this request is a tracking
     * request initiated by antoher tracker
     */
    isInitiatedByPredecessor() {
        if(this.predecessor){
            if (browserTabs.getTab(this.browserTabId).isTracker(this.predecessor.domain)) {
                console.info("Redirect origin " + this.predecessor.domain + " for " + this.url + " is a tracker")
                return true;
            } else {
                return this.predecessor.isInitiatedByPredecessor();
            }
        }
    }

    /**
     * The last four categories only deviate very slightly, so they are differentiated in this method
     * Lets say the chain is A.com -> X.com -> Y.com -> B.com/q?id=1234 , where we are analyzing B.com
     * A.com hereby is the originRequest of the cookies transported in the URL of B.com, meaning the closest request  in
     * the redirect/inclusion chain that owned the cookie of value 1234.
     * In most cases, this request will be undefined
     * If we have found such a request and it is a FIRST PARTY request there are two possibilities:
     *  1. The request to B.com is also a tracking request, as it has an identifying cookie, then it is 1ST PARTY COOKIE SYNCING
     *  2. The request is not tracking, and is therefore ANALYSIS
     * If the originRequest is a THIRD PARTY request:
     *  1. The request to B.com is also tracking, the it is 3RD PARTY COOKIE SYNCING
     *  2. The request is not tracking, then it is FORWARDING
     *
     * If we don't find an origin request, that carried the cookie, we assume that the redirect/inclusion chain might have
     * been interrupted by incorrect use of the referer header. Therefore we also test directly if the originRequest could be
     * the main page, circumventing the redirection/inclusion chain and checking if any cookie from the main page can be found in the URL
     * parameters.
     */
    setCookieSyncing() {
        if(!this.thirdParty) return;
        let originRequest = this.getRedirectOrigin();

        // todo: what about the parameters that are forwarded but never linked to cookies
        // todo: also for 1st party syncing, does the synced-to url have to be identifying?
        if (originRequest) {
            if (originRequest.thirdParty && originRequest.domain !== this.domain) {
                if (this.isBasicTracking.call(this)) {
                    this.category = Categories["3rd-SYNCING"];
                } else {
                    this.category = Categories.FORWARDING;
                }
            } else {
                if (this.isBasicTracking.call(this)) {
                    this.category = Categories["1st-SYNCING"];
                } else {
                    this.category = Categories.ANALYSIS;
                }
            }
        } else if (this.isDirectInclusionFromDomain.call(this)) {
            if (this.isBasicTracking.call(this)) {
                this.category = Categories["1st-SYNCING"];
            } else {
                this.category = Categories.ANALYSIS;
            }
        }
    }

    isDirectInclusionFromDomain() {
        let mainCookies = browserTabs.getTab(this.browserTabId).mainDomain.cookies;
        for (let mainCookie of mainCookies) {
            if (!mainCookie.identifying) continue;
            for (let value of this.urlSearchParams.values()) {
                if (this.isParamsEqual(value, mainCookie.value)) {
                    console.info("Found match from main domain " + value)
                    return true;
                }
            }
        }
    }

    /**
     * If the request is a result of a redirection, check first if the cookies of the redirecting request have been
     * set as an URL parameter. If not, but the Parameter also occurs in the redirecting requests URL, recursively check
     * that request as well.
     * TODO: no solution for if the parameter is never linked to a cookie yet
     * @returns {undefined| WebRequest} the origin request of the cookie forwarded through URL parameters
     */
    getRedirectOrigin() {
        if (this.predecessor) {
            if(this.isCookieSendAsParam()){
                return this.predecessor;
            } else if (this.isParamsForwarded()){
                if(this.predecessor.thirdParty) {
                    console.warn("THIRD PARTY FORWARDER " + this.predecessor.url)
                    console.log(this.url)
                }
                return this.predecessor.getRedirectOrigin();
            }
        }
    }

    /**
     * the cookie of the request that redirected to our request of interest is send as Url Parameter
     * @returns {boolean}
     */
    isCookieSendAsParam(){
        for(let predecessorCookie of this.predecessor.cookies){
            if (!predecessorCookie.identifying) continue;

            for(let value of this.urlSearchParams.values()) {
                if (this.isParamsEqual(value, predecessorCookie.value)) {
                    console.info("FOUND ONE for " + this.url + "   " + value)
                    return true;
                }
            }
        }
    }

    /**
     * the Parameter of oru request also occurs in the parameter of the preceding request
     * @returns {boolean}
     */
    isParamsForwarded(){
        for(let originalParam of this.urlSearchParams.values()) {
            for(let predecessorParam of this.predecessor.urlSearchParams.values()){
                if(this.isParamsEqual(originalParam, predecessorParam)){
                    console.log("Forwarded parameter " + originalParam)
                    return true;
                }
            }
        }
    }


    /**
     * Cover cases the inclusion cases form Imanes paper
     * identifier -> identifier
     * *id* -> id
     * id -> *id*
     * for a minimum length of 4 and given that is isnt a boolean
     * This method is used for both cookie to URL parameter as well as URL to URL comaprison
     * @param originalParameterValue
     * @param comparisonValue
     * @returns {boolean}
     */
    isParamsEqual(originalParameterValue, comparisonValue) {
        if(originalParameterValue.length < 4 || comparisonValue.length < 4) return false;
        if(originalParameterValue == true || originalParameterValue == false) return false;
        if(comparisonValue == false || comparisonValue == true) return false;

        return originalParameterValue.includes(comparisonValue) || comparisonValue.includes(originalParameterValue);
    }

    /**
     * Stores the constructed object in Tab object of the corresponding tab and forwards it to the popup if necessary
     */
    archive(){
        browserTabs.getTab(this.browserTabId).storeWebRequest(this);
    }

    /**
     * Gets either the request that caused a redirect to our request, or the referer, if either of the two exist
     * @returns {any}
     */
    getPredecessor() {
        let redirects = browserTabs.getTab(this.browserTabId).getRedirectsIfExist(this.id);
        if (redirects) {
            let directPredecessor = redirects.find(redirect => redirect.destination === this.url);
            if (directPredecessor) {
                let originRequest = browserTabs.getTab(this.browserTabId).getCorrespondingRequest(directPredecessor.originUrl, directPredecessor.id)
                return originRequest;
            } else{
                console.warn("Waht happened here")
            }
        } else if(this.completeReferer){
            let originRequest = browserTabs.getTab(this.browserTabId).getCorrespondingRequest(this.completeReferer)
            return  originRequest;
        }
    }

    integrateResponse(responseDetails){
        if(!responseDetails.responseHeaders) return;
        for (let attribute of responseDetails.responseHeaders){
            if (attribute.name.toLowerCase() === "set-cookie") {
                let cookies = this.parseSetCookie(attribute)
                this.cookies.push(...cookies);
                browserTabs.getTab(this.browserTabId).extendWebRequestCookies(this.domain, cookies)
            }
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
     * Gets from the stored redirects the reqeust that redirect to our request, if it exists
     * @returns {any}
     */
    getPredecessor() {
        let request = browserTabs.getTab(this.browserTabId).getCorrespondingRequest(this.url, this.id);
        if(!request){
            console.warn("No corresponding request found for this response");
            return;
        }

        let redirects = browserTabs.getTab(this.browserTabId).getRedirectsIfExist(this.id);
        if (redirects) {
            let directPredecessor = redirects.find(redirect => redirect.destination === this.url);
            if (directPredecessor) {
                let originRequest = browserTabs.getTab(this.browserTabId).getCorrespondingRequest(directPredecessor.originUrl, directPredecessor.id)
                return originRequest;
            }
        } else if(this.completeReferer){
            let originRequest = browserTabs.getTab(this.browserTabId).getCorrespondingRequest(request.completeReferer) //here is the difference because im not sure if referer set in answer
            return originRequest;
        }
    }
}

let SEND = true;
let SET = false;
/**
 * Data about each cookie is stored in this class
 */
class Cookie{
    constructor (url, key, value, mode) {
        this.url = url; //string with all parameters
        this.key = key;
        this.value = value;
        this.mode = mode;
        this.identifying = false; // cookie default to being non identifying
        this.safe = false; // cookies also default to non-safe until proven otherwise
    }

    /**
     * For all the cookies from the background request, check if the key is the same (so same cookie)
     * but value is different (so identifying possible)
     * @param comparisonCookies from background reqeust
     */
    compareCookiesFromShadowRequest(comparisonCookies){
        for (let cookie of comparisonCookies){
            if(cookie.key === this.key) {
                if (cookie.value !== this.value) {
                    console.info("Found id cookie for " + this.url + ": " + this.key);
                    this.identifying = true;
                } else {
                    this.safe = true;
                }
            }
        }
    }
}
