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
request.onsuccess = (event) => db = event.target.result;

/**
 * When upgrade event is triggered, the database schemas can be updated and changed
 * @param event
 */
request.onupgradeneeded = function(event) {
    /**
     * An objectStore is a bit like a table in a normal database. Our database currently has only one, "cookies",
     * which contains all the "safe" cookies found by Imanes work.
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