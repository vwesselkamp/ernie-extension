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
        return this.mode + " - " + this.key + ": " + this.value;
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
    constructor(value, originDomain) {
        this.value = value;
        this.originDomain = originDomain;
    }
}