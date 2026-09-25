require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('./src/config/db');
const User = require('./src/models/User');
const Department = require('./src/models/Department');

async function addFaculty() {
    await connectDB();

    // Find a department to assign the faculty to (e.g., CSE)
    const dept = await Department.findOne({ code: 'CSE' });

    const newFaculty = await User.create({
        code: 'EMP9999', // Unique Employee Code
        name: 'Prof. John Doe',
        email: 'johndoe@college.edu',
        passwordHash: 'Password@123', // Mongoose will automatically hash this
        role: 'FACULTY', // Can also be 'CLASS_ADVISOR' or 'HOD'
        departmentId: dept._id,
        status: 'ACTIVE',
        staff: {
            designation: 'Assistant Professor',
            employeeType: 'PERMANENT'
        },
    });

    console.log('Faculty added successfully:', newFaculty.email);
    process.exit(0);
}

addFaculty();
