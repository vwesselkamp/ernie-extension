function saveOptions(e) {
    browser.storage.local.set({
        originLocation: document.querySelector("#origin-location").value,
        shadowLocation: document.querySelector("#shadow-location").value,
        user: document.querySelector("#user").value,
        password: document.querySelector("#password").value,
    });
    e.preventDefault();
}

function restoreOptions() {
    var origin = browser.storage.local.get('originLocation');
    origin.then((res) => {
        document.querySelector("#origin-location").value = res.originLocation || 'http://localhost:8080/extension';
    });

    var shadow = browser.storage.local.get('shadowLocation');
    shadow.then((res) => {
        document.querySelector("#shadow-location").value = res.shadowLocation || 'http://localhost:8080/shadow-tabs';
    });

    var user = browser.storage.local.get('user');
    user.then((res) => {
        document.querySelector("#user").value = res.user || 'admin';
    });

    var password = browser.storage.local.get('password');
    password.then((res) => {
        document.querySelector("#password").value = res.password || 'secret';
    });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);