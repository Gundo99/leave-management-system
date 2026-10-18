const employees = [
    {
        employeeId: "NDO001",
        firstName: "Victor",
        surname: "Ndou",
        username: "victorn",
        password: "1234",
        role: "employee",
        gender: "male",
        dateOfBirth: "1998-06-15",
        employmentStartDate: "2025-01-10"
    }
];

const admin = {
    username: "admin",
    password: "1234",
    role: "admin"
};

const leaveBalances = [
    {
        employeeId: "NDO001",
        annual: 0,
        sick: 5,
        maternity: 120,
        parental: 10,
        familyResponsibility: 3,
        study: 10,
        birthday: 1,
        unpaid: 0
    }
];

const leaveRequests = [];

console.log(employees);
console.log(admin);
console.log(leaveBalances);
console.log(leaveRequests);