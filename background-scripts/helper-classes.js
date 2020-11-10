/**
 * Data about each cookie is stored in this class
 */
class Cookie{
    /**
     * @param key {string} also called name of the cookie
     * @param value {string}
     * @param mode {CookieType} SET or SEND if from request, JS if set from Javascript
     */
    constructor (key, value, mode) {
        this.key = key;
        this.value = value;
        this.mode = mode;
        this.category = Cookie.CookieType.NONE // cookie default to being non-identifying, non-safe
    }

    static CookieType = Object.freeze({
        "IDENTIFYING":"identifying",
        "SAFE":"safe",
        "NONE":"normal",
    })

    static Mode = Object.freeze({
        "SET": "SET",
        "SEND": "SEND",
        "JS": "javascript"
    })

    get identifying(){
        return this.category === Cookie.CookieType.IDENTIFYING;
    }

    get safe(){
        return this.category === Cookie.CookieType.SAFE;
    }

    /*
    set identifying(value){
        if(value === true){
            this.category = Cookie.CookieType.IDENTIFYING;
        }
    }

    set safe(value){
        if(value === true){
            this.category = Cookie.CookieType.SAFE;
        }
    }*/

    get content(){
        if(this.mode === Cookie.Mode.JS){
            return this.key + ": " + this.value;
        } else{
            return this.mode + " - " + this.key + ": " + this.value;
        }
    }

    /**
     * For all the cookies from the background request, check if the key is the same (so same cookie)
     * but value is different (so identifying possible).
     * As we save all versions of a cookie set by a webpage, two different versions are treated like two different cookies
     * That means we compare this cookie isolated from other versions of it. Some versions of a cookie might therefore be
     * categorized as identifying while others are not.
     * @param comparisonCookies{[Cookie]} from background request
     */
    compareCookiesFromShadowRequest(comparisonCookies){
        for (let cookie of comparisonCookies){
            if(cookie.key === this.key) {
                if (cookie.value !== this.value && !this.safe) {
                    this.category = Cookie.CookieType.IDENTIFYING
                } else {
                    this.category = Cookie.CookieType.SAFE
                }
            }
        }
    }

    /**
     * Write a safe cookie to IndexedDb, to slowly collect safe cookies over time, in case they differ over different visits
     * @param domain
     */
    writeToDB(domain) {
        if(this.category !== Cookie.CookieType.SAFE) return ;
        let cookieObjectStore = db.transaction("cookies", "readwrite").objectStore("cookies");
        let cookie = {domain: domain, key: this.key, value: this.value};
        cookieObjectStore.add(cookie);
    }

    setIfSafeCookie(safeCookie) {
        if(safeCookie.key === this.key && safeCookie.value === this.value) {
            this.category = Cookie.CookieType.SAFE
        }
    }
}

/**
 * Holds information about a single URL parameter
 */
class Parameter{
    /**
     * @param value{string} of the parameter
     * @param originDomain{string} is the URLs domain
     */
    constructor(value, type) {
        this.value = value;
        this.type = type
    }

    static ParameterType = Object.freeze({
        "URL_KEY":"url_key",
        "URL_VALUE":"url_value",
        "PATH":"path",
    })

    addOrigin(originDomain){
        this.originDomain = originDomain;
        return this;
    }
}

/**
 * Class that keeps track of all requests of a certain domain, and provides fast information about the domains tracking
 * properties.
 */
class Domain {
    constructor(domain) {
        this.name = domain;
        this.tracker = false;
        this.cookies = new Set();
        this.requests = [];
        this.responses = [];
    }

    /**
     * saves request/response in the corresponding array
     */
    archive(request){
        this.addCookies(request.cookies);
        if (request instanceof Response){
            this.responses.push(request);
        } else if(request instanceof WebRequest){
            this.requests.push(request);
        }
    }

    /**
     * @param cookieArray{[Cookie]} is an array of Cookie objects
     */
    addCookies(cookieArray) {
        for(let cookie of cookieArray){
            this.cookies.add(cookie)
        }
    }

    setTracker(value){
        this.tracker = value;
    }

    retrieveCookieIfExists(key, value){
        for(let cookie of this.cookies.values()){
            if(cookie.key === key && cookie.value === value){
                return cookie;
            }
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
    setSafeCookiesForDomain() {
        return new Promise((resolve, reject) => {
            /**
             * For each safe cookie from our query result, check if the same cookie was send in our request
             * @param queryResult contain all safe cookies from the domain of our request
             */
            let compareQueryWithDomainCookies = (queryResult) => {
                const cursor = queryResult.target.result;
                if (cursor) {
                    this.cookies.forEach(cookie => {
                        cookie.setIfSafeCookie.call(cookie, cursor.value)
                    })
                    cursor.continue();
                } else {
                    // reached the end of the cursor so we exit the callback function and can resole the promise at the
                    // same time
                    resolve(this.cookies)
                }
            }

            // index over the domains of the safe cookies
            const cookieIndex = db.transaction(["cookies"]).objectStore("cookies").index("domain");
            // filters all safe cookies for the request url
            try{
                const indexRange = IDBKeyRange.only(this.name);
                let idbRequest = cookieIndex.openCursor(indexRange);
                idbRequest.onsuccess = compareQueryWithDomainCookies;
                idbRequest.onerror = event => reject(event)
            } catch (e) {
                console.log(this.name)
                console.log(e)
            }

        });
    }

    /**
     * Cookies are compared domain wide, meaning that if the domain of a request has a cookie in the same domain of the
     * shadow request, these are set. This also means, that the early requests are also classified correctly
     */
    setIdentifyingCookies(shadowTabId) {
        return new Promise((resolve, reject) => {
            let shadowDomain = browserTabs.getTab(shadowTabId).domains.find(sd => sd.name === this.name)
            if (shadowDomain) {
                for (let cookie of this.cookies) {
                    cookie.compareCookiesFromShadowRequest(shadowDomain.cookies);
                    if(cookie.safe){
                        cookie.writeToDB(this.name);
                    }
                }
            } else {
                console.warn("No shadow domain found for " + this.name)
            }
            resolve("Done");
        })
    }
}