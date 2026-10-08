initializeStorage();

const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");

loginForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    const employees = getEmployees();
    const admin = getAdmin();

    const employee = employees.find(function (employee) {
        return employee.username === username &&
               employee.password === password;
    });

    if (username === admin.username && password === admin.password) {
        setCurrentUser(admin);
        window.location.href = "admin-dashboard.html";
    }
    else if (employee) {
        setCurrentUser(employee);
        window.location.href = "employee-dashboard.html";
    }
    else {
        loginMessage.textContent = "Invalid username or password.";
    }
});