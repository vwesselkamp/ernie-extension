function saveOptions(e) {
    browser.storage.local.set({
        location: document.querySelector("#location").value,
        user: document.querySelector("#user").value,
        password: document.querySelector("#password").value,
    });
    e.preventDefault();
}

function restoreOptions() {
    var location = browser.storage.local.get('location');
    location.then((res) => {
        document.querySelector("#location").value = res.location || 'http://localhost:8080/extension';
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