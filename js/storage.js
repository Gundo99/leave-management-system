function initializeStorage() {
    if (!localStorage.getItem("employees")) {
        localStorage.setItem("employees", JSON.stringify(employees));
    }

    if (!localStorage.getItem("admin")) {
        localStorage.setItem("admin", JSON.stringify(admin));
    }

    if (!localStorage.getItem("leaveBalances")) {
        localStorage.setItem("leaveBalances", JSON.stringify(leaveBalances));
    }

    if (!localStorage.getItem("leaveRequests")) {
        localStorage.setItem("leaveRequests", JSON.stringify([]));
    }
}

function getEmployees() {
    return JSON.parse(localStorage.getItem("employees"));
}

function getAdmin() {
    return JSON.parse(localStorage.getItem("admin"));
}

function getLeaveBalances() {
    return JSON.parse(localStorage.getItem("leaveBalances"));
}

function getLeaveRequests() {
    return JSON.parse(localStorage.getItem("leaveRequests"));
}

function setCurrentUser(user) {
    localStorage.setItem("currentUser", JSON.stringify(user));
}

function getCurrentUser() {
    return JSON.parse(localStorage.getItem("currentUser"));
}