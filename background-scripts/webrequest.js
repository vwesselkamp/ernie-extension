/**
 * Enum like structure for the categories of tracking.
 * The key is what is used in the JS code, the value becomes a HTML class and is used in CSS for styling.
 * Needs to be a var to be accessible to the popup as well
 */
var Categories = Object.freeze({
    "BASICTRACKING":"basic-tracking",
    "TRACKINGBYTRACKER":"tracking-by-tracker",
    "NONE":"nothing",
    "3rd-SYNCING":"third-syncing",
    "1st-SYNCING":"first-syncing",
    "FORWARDING": "forwarding",
    "ANALYTICS": "analytics"
})

/**
 * Request class and superclass for all HTTP communication
 * As there is no such thing as an abstract class in JS, the deviating methods for response are only overwritten
 */
class WebRequest{
    constructor(webRequest) {
        this.url = webRequest.url; //string with all parameters
        this.browserTabId = webRequest.tabId; // id of the open browser tab
        this.id = webRequest.requestId;
        this.domain = getSecondLevelDomainFromUrl(webRequest.url); //inline?
        //not possible to inline this, because when sending it as a runtime message to the popup script, the methods are no longer available
        this.thirdParty = this.isThirdParty();
        this.cookies = [];
        this.forwardedIdentifiers = new Set();
        this.forwardedParams = new Set();
        this.category = Categories.NONE;
        this.urlSearchParams = this.extractURLParams()

        // we process all information from headers
        // only later we can analyze it
        this.extractFromHeader(this.getHeader(webRequest));
        this.predecessor = this.getPredecessor();
    }

    get referer(){
        if(this.completeReferer){
            return getSecondLevelDomainFromUrl(this.completeReferer);
        }
    }

    /**
     * @returns {string} the URl as it should be put in the popup.
     */
    get content(){
        return this.markUpSharedIdentifiers(false);
    }

    get debugContent(){
        return this.markUpSharedIdentifiers(true);
    }
    /**
     * searches first for all the occurences of forwarded identifiers
     * and marks them in HTML with span, so they can be later styled in a diferent colour.
     * The search is done by with URL encoded element, as the forwardedParameters have been saved URL decoded. The HTML is then
     * inserted in the plain string, such that is not URL encoded and stays plain hTML
     * @param debugMode{boolean} determines if forwarded parameters, that are not identifiers, are also marked
     * @return {string}
     */
    markUpSharedIdentifiers(debugMode) {
        let newURL = new URL(this.url)
        let origin = newURL.origin
        let pathAndQuery = newURL.pathname + newURL.search

        this.forwardedIdentifiers.forEach((parameter) => {
            let association = parameter.originDomain !== browserTabs.getTab(this.browserTabId).domain ? "third-forwarded" : "first-forwarded";
            pathAndQuery = pathAndQuery.replaceAll(encodeURIComponent(parameter.value), "<span class=\"" + association + "\">" + parameter.value + "</span>")
        })

        if(debugMode){
            this.forwardedParams.forEach((parameter) => {
                pathAndQuery = pathAndQuery.replaceAll(encodeURIComponent(parameter.value), "<span class=\"" + "forwarded" + "\">" + parameter.value + "</span>")
            })
        }

        return this.domain + " : " + origin + '/' + pathAndQuery
    }

    get partyString(){
        return this.thirdParty ? "third" : "first";
    }

    /**
     * this is here so it can be overwritten for the Response Class, where the header attribute is named differently
     */
    getHeader(webRequest) {
        return webRequest.requestHeaders;
    }

    /**
     * We split the URL parameters at any character not in the regex below, because they are assumed to be delimiters
     * @returns {[string]}
     */
    extractURLParams() {
        let params = (new URL(this.url)).searchParams;
        let splitParams = [];
        for(let value of params.values()){
            // splits at what is considered delimiters in Imanes paper
            let result = value.split(/[^a-zA-Z0-9-_.]/);
            splitParams.push(...result);
        }
        return splitParams;
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
     * Parses each header attribute and extracts the forwardedIdentifiers ones
     */
    extractFromHeader(header) {
        for (let attribute of header){
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
            // cookies are separated by ; and the values defined after the first =
            // they cannot contain spaces or ;
            let rawCookies = attribute.value
                .split(';')
                .map(v => v.split(/=(.+)/));
            for (let cookie of rawCookies) {
                this.cookies.push(this.processCookie(cookie, Cookie.Mode.SEND));
            }
        }
    }

    /**
     * Checks first if we already encountered the cookie, in which case, the reference to the existing cookie is
     * stored. This stops the cookie collection of the domain to contain duplicates. A single request can still contain
     * duplicate cookies, as there might be some send as well as set again.
     * Cookies with the same key but different value are treated as different cookies.
     * @param cookie{[string]} contains key and value of the extracted raw cookie
     * @return {Cookie} tha
     */
    processCookie(cookie, mode) {
        // if there was no value for the cookie, assign empty string
        if (!cookie[1]) cookie[1] = "";

        let existingCookie =
            browserTabs.getTab(this.browserTabId)
                .upsertDomain(this.domain)
                .retrieveCookieIfExists(cookie[0].trim(), cookie[1].trim()) //trims of white spaces at the edges of the key, which are left over from the regex

        // the reference to the cookie is stored here, and on a later call of storeWebRequest() also in the
        // corresponding domain of the tab
        if (existingCookie) {
            return existingCookie
        } else {
            return new Cookie(cookie[0].trim(), cookie[1].trim(), mode)
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


    /**
     * Example:
     A3=d=AQABBOKubV8CEDpyvhY-1MerOzNL5rC-loAFEgEBAQEAb193XwAAAAAA_SMAAAcI4q5tX7C-loA&S=AQAAAkP0da8j3VEBAH0bHkie0e8;
     Max-Age=31557600; Domain=.yahoo.com; Path=/; SameSite=None; Secure; HttpOnly
     We are interested only in the first part which contains key=value; of the cookie
     Separate only at the first =
     TODO: There seems to be the option to have several cookies in the same "set-cookies" attribute, separated by a , or
     by a line break.
     * @param headerAttribute is the value of the header attribute
     * @returns {[Cookie]} the cookies from this attribute
     */
    parseSetCookie(headerAttribute) {
        let collectedCookies = [];
        // Line break occurred on walmart.com, and firefox recognizes it, even though it doesn't seem conform to the standard
        let lines = headerAttribute.value.split("\n");
        for (let line of lines) {
            // split different parameters of the set-ccokie
            let result = line.split(';', 1)
            /*
            The following regex splits at every = that is followed by at least one character
            This way, only the first = is matched
            This splits key and value from each other
             */
            result = result[0].split(/=(.+)/);
            try{
                collectedCookies.push(this.processCookie(result, Cookie.Mode.SET));
            } catch (e){
                console.warn(e + "\nParsed cookie: " + result[0] + " " + result[1] + "\nLine: " + line);
            }
        }
        return collectedCookies;
    }

    /**
     * Gets either the request that caused a redirect to our request, or the referer, if either of the two exist
     * @returns {WebRequest}
     */
    getPredecessor() {
        let redirects = browserTabs.getTab(this.browserTabId).getRedirectsIfExist(this.id);
        if (redirects) {
            let directPredecessor = redirects.find(redirect => redirect.destination === this.url);
            if (directPredecessor) {
                return browserTabs.getTab(this.browserTabId).getCorrespondingRequest(directPredecessor.originUrl, directPredecessor.id);
            } else{
                console.warn("Redirected but redirect origin not found for: " + this.url)
            }
        } else if(this.completeReferer){
            return  browserTabs.getTab(this.browserTabId).getCorrespondingRequest(this.completeReferer);
        }
    }

    /**
     * If a response on this request has been found, its data is integrated into the request
     * @param responseDetails
     */
    integrateResponse(responseDetails){
        if(!responseDetails.responseHeaders) return;
        for (let attribute of responseDetails.responseHeaders){
            if (attribute.name.toLowerCase() === "set-cookie") {
                let cookies = this.parseSetCookie(attribute)
                this.cookies.push(...cookies);
                // also update the domain cookie store, only with the newly added cookies
                browserTabs.getTab(this.browserTabId).extendWebRequestCookies(this.domain, cookies)
            }
        }
    }





    // Everything below this is for the analysis and categorization

    /**
     * If the request is Basic Tracking, also mark the domain in the tab object as a tracker
     */
    setBasicTracking() {
        if (this.isBasicTracking.call(this)) {
            this.category = Categories.BASICTRACKING;
            browserTabs.getTab(this.browserTabId).markDomainAsTracker(this.domain);
        }
    }

    /**
     * Category "Basic Tracking" is fulfilled when the request is a third party request and there are identifying cookies
     */
    isBasicTracking() {
        return this.thirdParty && this.cookies.some(cookie => cookie.identifying === true)
    }


    setTrackingByTracker() {
        if (this.isTrackingInitiatedByTracker()) {
            this.category = Categories.TRACKINGBYTRACKER
        }
    }

    /**
     * Checks if either the referer of a request is a tracker or if the request has been a redirect from a tracker
     * If either is the case and the request itself is a tracking request, it is "Tracking init by tracker"
     */
    isTrackingInitiatedByTracker() {
        // can only be a "tracking request initiated by another tracker" if it is also a basic tracking request
        if(this.category === Categories.BASICTRACKING){

            // check both options for initiation
            return this.isInitiatedByPredecessor.call(this);
        }
    }

    /**
     * Checks if a predecessor has been defined, and its a different party
     * If that is the case and the domain is a tracker, then the requirement is fullfilled
     * Otherwise check further back in the redirection chain
     */
    isInitiatedByPredecessor() {
        if(this.predecessor && this.predecessor.domain !== this.domain){
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
     *  2. The request is not tracking, and is therefore ANALYTICS
     * If the originRequest is a THIRD PARTY request:
     *  1. The request to B.com is also tracking, the it is 3RD PARTY COOKIE SYNCING
     *  2. The request is not tracking, then it is FORWARDING
     *
     * If we don't find an origin request, that carried the cookie, we assume that the redirect/inclusion chain might have
     * been interrupted by incorrect use of the referer header. Therefore we also test directly if the originRequest could be
     * the main page, circumventing the redirection/inclusion chain and checking if any cookie from the main page can be found in the URL
     * parameters.
     */
    setIdentifierSharingCategories() {

        let setIdentifierSharingForThirdParties = () => {
            if (this.isBasicTracking.call(this)) {
                this.category = Categories["3rd-SYNCING"];
            } else {
                this.category = Categories.FORWARDING;
            }
        }

        let setIdentifierSharingForFirstParties = () => {
            if (this.isBasicTracking.call(this)) {
                this.category = Categories["1st-SYNCING"];
            } else {
                this.category = Categories.ANALYTICS;
            }
        }


        if(!this.thirdParty) return;

        // a special case for requests redirected from doubleclick
        if(this.isEncryptedSharing()){
            setIdentifierSharingForThirdParties();
            return
        }

        let originRequest = this.getRedirectOrigin();
        // todo: what about the parameters that are forwarded but never linked to cookies
        if (originRequest) {
            if (originRequest.thirdParty ) {
                // if it shares url parameters even further backwards, we check if it could belong into
                // one of the overlapping categories
                this.getParamSharedEvenFurther(originRequest)

                if(originRequest.domain !== this.domain){
                    setIdentifierSharingForThirdParties();
                }
            } else {
                setIdentifierSharingForFirstParties();
            }
        }  else if (this.isDirectInclusionFromDomain()) {
            setIdentifierSharingForFirstParties();
        }
    }

    /**
     * If a cookie from the main domain is found as a shared identifier, it is very likely that the
     * redirection/inclusion chain has just been interrupted, so we still consider them
     * @return {boolean}
     */
    isDirectInclusionFromDomain() {
        let mainCookies = browserTabs.getTab(this.browserTabId).mainDomain.cookies;
        if(this.isCookieSendAsParam(mainCookies, browserTabs.getTab(this.browserTabId).domain)){
            return true;
        }
    }

    /**
     * If the request is a result of a redirection, check first if the cookies of the DOMAIN of the redirecting request
     * have been set as an URL parameter. If not, but the Parameter also occurs in the redirecting requests URL, recursively check
     * that request as well.
     * @returns {undefined| WebRequest} the origin request of the cookie forwarded through URL parameters
     */
    getRedirectOrigin() {
        if (this.predecessor) {
            let domainCookies = browserTabs.getTab(this.browserTabId).upsertDomain(this.predecessor.domain).cookies
            if(this.isCookieSendAsParam(domainCookies, this.predecessor.domain)){
                return this.predecessor;
            } else if (this.isParamsForwarded()){
                return this.predecessor.getRedirectOrigin();
            }
        }
    }

    /**
     *
     * @param predecessorCookies{[Cookie]} are the cookies of the domain of the predecessor
     * @param originDomain{string} is the domain form where the cookies are
     * @returns {boolean} if the cookie of the request that redirected to our request of interest is send as Url Parameter
     */
    isCookieSendAsParam(predecessorCookies, originDomain){
        let isSendAsParam = false;

        for(let predecessorCookie of predecessorCookies){
            if (!predecessorCookie.identifying) continue;

            // split again at the delimiter defined by Imane
            let splitCookie = predecessorCookie.value.split(/[^a-zA-Z0-9-_.]/);
            for(let split of splitCookie){
                for(let value of this.urlSearchParams.values()) {
                    if (this.isParamsEqual(value, split)) {
                        console.info("FOUND ONE for " + this.url + "   " + value)
                        // add the forwarded parameter with the origin information
                        this.forwardedIdentifiers.add(new Parameter(value, originDomain));
                        isSendAsParam = true; // found at least one forwarded cookie, but continue to find all
                    }
                }
            }
        }
        return isSendAsParam;
    }

    /**
     * the Parameter of oru request also occurs in the parameter of the preceding request
     * @returns {boolean}
     */
    isParamsForwarded(){
        let isForwarded = false;
        for(let originalParam of this.urlSearchParams.values()) {
            for(let predecessorParam of this.predecessor.urlSearchParams.values()){
                if(this.isParamsEqual(originalParam, predecessorParam)){
                    console.info("Forwarded parameter " + originalParam)
                    // if the forwarded Parameter is a forwarded identifier of the predecesseor request, it is also
                    // an identifier for this request, as that means it has been linked to a cookie at a previous
                    // point in the chain. Otherwise, it is just a forwarded parameter
                    // TODO: set characteristics?
                    let forwardedIdentifier = this.predecessor.retrieveParamIfExists(originalParam)
                    if(forwardedIdentifier){
                        this.forwardedIdentifiers.add(forwardedIdentifier);
                    } else {
                        this.forwardedParams.add(new Parameter(originalParam, this.predecessor.domain))
                    }
                    isForwarded = true; // found at least one forwarded parameter
                }
            }
        }
        return isForwarded
    }


    /**
     * Cover cases the inclusion cases form Imanes paper
     * identifier -> identifier
     * *id* -> id
     * id -> *id*
     * id -> base64(id)
     * for a minimum length of 4 and given that is isn't a boolean.
     * Also check for Google Analytics (GA) sharing
     * This method is used for both cookie to URL parameter as well as URL to URL comparison
     * @param originalParameterValue is always a URL parameter
     * @param comparisonValue is either a URL param or a cookie value
     * @returns {boolean}
     */
    isParamsEqual(originalParameterValue, comparisonValue) {
        /**
         * This is a special kind of parameter sharing done by google-analytics.
         * As we usually don"t consider . as a separator, it is normally not found. We therefore explicitly check,
         * if the GA cookie of the form "GAX.Y.Z.C" of the first party domain is shared as a URL parameter of the
         * form "Z.C"
         * @returns {boolean}
         */
        let isGASharing = () => {
            // the second domain is allowed for the test website
            if(this.domain === "google-analytics.com" || this.domain === "non-identifying.com"){
                let splitValue = comparisonValue.split('.');
                let cutParam = splitValue.slice(Math.max(splitValue.length - 2, 0)).join('.')
                return originalParameterValue === cutParam
            }
        }

        /**
         * In Imanes paper, this was only checked for doubleclick, however I consider it for all domains, because why not
         * @return {boolean}
         */
        let isBase64EncodedSharing = () => {
            // as we consider = a separator it is removed in the previous splitting of parameters
            // so we have to remove the trailing = for our base64 encoded comparison value as well
            let base64EncodedValue = btoa(comparisonValue)
            while (base64EncodedValue[base64EncodedValue.length - 1] === "=") {
                base64EncodedValue = base64EncodedValue.substring(0, base64EncodedValue.length - 1)
            }
            return originalParameterValue === base64EncodedValue;
        }



        const MIN_LENGTH = 4;

        // too short or pointless values
        if(originalParameterValue.length < MIN_LENGTH || comparisonValue.length < MIN_LENGTH) return false;
        if(originalParameterValue === "true" || originalParameterValue === "false") return false;

        if(isGASharing()) return true;

        if(isBase64EncodedSharing()) return true

        //finally the direct comparison
        return originalParameterValue === comparisonValue;
    }

    /**
     * Doubleclick send cookies in the URL parameters encrypted.
     * From their docs from 15/10/20 [https://developers.google.com/authorized-buyers/rtb/cookie-guide]:
     * A website send a request to doubleclick.net containing ?google_nid=1234
     * where 1234 is the identifier supplied by Google(?). Doubleclick then redirects back to the website, with its cookie
     * encrypted (?) in the URL parameters. This specific case is covered here
     * @returns {boolean}
     */
    isEncryptedSharing() {
        if(this.predecessor && this.domain !== "doubleclick.net"){
            // the second domain is for the test pages
            if(this.predecessor.domain === "doubleclick.net" || this.predecessor.domain === "cookies.com"){
                // exclude the unlikely case of the request being caused by an inclusion, not a redirect
                if(!this.isCausedByRedirect()) return false;
                return (new URL(this.predecessor.url)).searchParams.has("google_nid")
            }
        }
    }

    /**
     * Checks if request has been caused through a redirect
     * @returns {boolean}
     */
    isCausedByRedirect(){
        let redirects = browserTabs.getTab(this.browserTabId).getRedirectsIfExist(this.id);
        if (redirects) {
            // check if there are any redirects that lead to our request
            return redirects.some(redirect => redirect.destination === this.url);
        }
    }

    /**
     * If the originRequest of a request is third party, we check if it still shares some of it own URL parameters with our request.
     * If that is the case, there might be several request which forwarded their cookies to our request.
     * The cookies found by a first party forwarding are therefore separated from those of third parties.
     * @param originRequest{WebRequest}
     */
    getParamSharedEvenFurther(originRequest) {
        for(let param of this.urlSearchParams){
            let forwardedIdentifier = originRequest.retrieveParamIfExists(param)
            if(forwardedIdentifier){
                this.forwardedIdentifiers.add(forwardedIdentifier);
            } else {
                this.forwardedParams.add(new Parameter(param, originRequest.domain))
            }
        }
    }

    retrieveParamIfExists(value){
        for(let param of this.forwardedIdentifiers.values()){
            if(param.value === value){
                return param;
            }
        }
    }
}



/**
 * Response class handles deviating behaviour from the requests
 * Responses are only created if the corresponding WebRequest got lost, to prevent a loss of information
 */
class Response extends WebRequest{
    /**
     * header attribute is called responseHeaders in responses
     */
    getHeader(webRequest) {
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
}
