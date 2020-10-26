// globally available db access
var db;

/*
The version determines if the database is updated. If the version already exist, it is simply opened. If the version is higher
than the current one, an upgrade event is triggered. In that event, the database schemas can be updated.
 */
const request = indexedDB.open("extension-db", 1);

/*
If this error occurs it most likely means that the database version is incorrect. Try reinstalling the popup,
which resets the current db version to 0, or raise the version number in the request above
 */
request.onerror = () => console.warn("Error: Database could not be initialized");

// db is successfully retrieved
request.onsuccess = (event) => {
    db = event.target.result
} ;

/**
 * When upgrade event is triggered, the database schemas can be updated and changed
 * @param event
 */
request.onupgradeneeded = function(event) {
    /**
     * An objectStore is a bit like a table in a normal database. Our database currently has only one, "cookies",
     * which contains all the "safe" cookies found by th extension over time.
     * The DB is either just updated or set up completely new, so we need to differentiate the two cases.
     * @returns {IDBObjectStore}
     */
    function initializeObjectStore() {
        try {
            // DB is setup completely new and we can freely set up our cookie store.
            // objectstore with autoincrementing key as we dont have a natural primary key for the cookies
            return db.createObjectStore("cookies", {autoIncrement: "true"});
        } catch (e) {
            // DB is only updated by raising the version number.
            // When updating the schema we cannot simply change the cookie store, it has to be deleted, and set up newly
            console.warn(e);
            db.deleteObjectStore("cookies");
            console.warn("Reinitializing object store cookies.")
            return db.createObjectStore("cookies", {autoIncrement: "true"});
        }
    }

    console.info("Database upgraded");
    db = event.target.result;

    const objectStore = initializeObjectStore();

    // Create an index to search cookies by url. We may have duplicates
    // so we can't use a unique index.
    objectStore.createIndex("domain", "domain", { unique: false });
};

// Also handle external database access
let mongoDBUser;
let mongoDBPassword;
let originDBLocation;
let shadowDBLocation;
let mongoDBAccess = false;

/**
 * Sets the vars we need to access the DB by retrieving them from the local storage
 */
function setDatabaseAccess() {
    var originLocation = browser.storage.local.get('originLocation');
    originLocation.then((res) => {
        originDBLocation = res.location || 'http://localhost:8080/extension';
    });

    var shadowLocation = browser.storage.local.get('shadowLocation');
    shadowLocation.then((res) => {
        shadowDBLocation = res.location || 'http://localhost:8080/shadow-tabs';
    });

    var user = browser.storage.local.get('user');
    user.then((res) => {
        mongoDBUser = res.user || 'admin';
    });

    var password = browser.storage.local.get('password');
    password.then((res) => {
        mongoDBPassword = res.password || 'secret';
    });
}
browser.storage.onChanged.addListener(setDatabaseAccess);

setDatabaseAccess();

//TODO
fetch("http://localhost:8080/ping")
    .then(response => response.text())
    .then(text => {
        if(text.includes("Greetings from RESTHeart!")){
            mongoDBAccess = true;
            console.log("MongoDB accessible")
        } else {
            console.warn("MongoDB inaccessible")
        }
    }).catch(e => console.log(e));

/**
 * We send a POST requests with the whole object as JSON in the body.
 * For fetch, the authorization need to be set in the header.
 * The content type defaults to application/text and must be manually set to json, or the restheart API doesn't accept it
 */
function sendTabToDB(tab) {
    if(!mongoDBAccess) return;
    console.log("Sending TAb with ID " + tab._id)
    let headers = new Headers();
    headers.set('Authorization', 'Basic ' + btoa(mongoDBUser + ":" + mongoDBPassword));
    headers.set('Content-Type', 'application/json');

    fetch(originDBLocation, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(tab)
    })

    fetch(shadowDBLocation, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(browserTabs.getTab(tab.shadowTabId))
    })
}

/**
 * retrieves from local storage, if extension is in Debug mode, and should display more information
 */
async function getDebugMode(){
    let res = await browser.storage.local.get('debug');
    // to make debug mode default
    if(res.debug === undefined) {
        return true;
    } else {
        return res.debug;
    }
}