/**
 * pust-data.js
 * ---------------------------------------------------------------------------
 * Official Pabna University of Science and Technology (PUST) reference data,
 * scraped from the university website (pust.ac.bd) so the editor's input
 * boxes can offer searchable, click-to-select suggestions instead of making
 * users type long names by hand.
 *
 * Contents:
 *   - UNIVERSITY_NAME / SHORT_NAME  — the official university name
 *   - LOGO_DATA_URL                 — the official logo as a base64 PNG
 *                                     (self-contained: works offline, and
 *                                     survives being embedded in the PDF)
 *   - FACULTIES / DEPARTMENTS       — every faculty and department
 *   - TEACHER_GROUPS                — faculty members per department with
 *                                     their current designations
 *   - DESIGNATIONS                  — every designation that appears above,
 *                                     in a sensible order for the dropdown
 *
 * NOTE: staffing changes over time. If a department adds teachers, append
 * them to the matching group below (name and designation only).
 */
(function (root) {
  'use strict';

  var UNIVERSITY_NAME = 'Pabna University of Science and Technology';
  var SHORT_NAME = 'PUST';

  // Official logo, resized to 440px wide (≈300 DPI at the largest logo slot)
  // and quantized to 128 colors so the file stays small.
  var LOGO_DATA_URL = 'data:image/png;base64,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';

  var FACULTIES = [
    'Faculty of Engineering and Technology',
    'Faculty of Science',
    'Faculty of Business Studies',
    'Faculty of Humanities and Social Science',
    'Faculty of Life and Earth Science'
  ];

  var DEPARTMENTS = [
    { name: 'Computer Science and Engineering', faculty: 'Faculty of Engineering and Technology' },
    { name: 'Electrical and Electronic Engineering', faculty: 'Faculty of Engineering and Technology' },
    { name: 'Electrical, Electronic and Communication Engineering', faculty: 'Faculty of Engineering and Technology' },
    { name: 'Information and Communication Engineering', faculty: 'Faculty of Engineering and Technology' },
    { name: 'Civil Engineering', faculty: 'Faculty of Engineering and Technology' },
    { name: 'Architecture', faculty: 'Faculty of Engineering and Technology' },
    { name: 'Urban and Regional Planning', faculty: 'Faculty of Engineering and Technology' },
    { name: 'Mathematics', faculty: 'Faculty of Science' },
    { name: 'Physics', faculty: 'Faculty of Science' },
    { name: 'Chemistry', faculty: 'Faculty of Science' },
    { name: 'Statistics and Data Science', faculty: 'Faculty of Science' },
    { name: 'Pharmacy', faculty: 'Faculty of Science' },
    { name: 'Business Administration', faculty: 'Faculty of Business Studies' },
    { name: 'Tourism and Hospitality Management', faculty: 'Faculty of Business Studies' },
    { name: 'Economics', faculty: 'Faculty of Humanities and Social Science' },
    { name: 'Bangla', faculty: 'Faculty of Humanities and Social Science' },
    { name: 'English', faculty: 'Faculty of Humanities and Social Science' },
    { name: 'Social Work', faculty: 'Faculty of Humanities and Social Science' },
    { name: 'Public Administration', faculty: 'Faculty of Humanities and Social Science' },
    { name: 'History', faculty: 'Faculty of Humanities and Social Science' },
    { name: 'Geography and Environment', faculty: 'Faculty of Life and Earth Science' }
  ];

  // [name, designation] per department. Source: pust.ac.bd department pages.
  var TEACHER_GROUPS = [
    {
      department: 'Computer Science and Engineering',
      teachers: [
        ['Dr. Md. Abdur Rahim', 'Professor'],
        ['Md. Shafiul Azam', 'Associate Professor'],
        ['S. M. Hasan Sazzad Iqbal', 'Associate Professor'],
        ['Dr. Md. Toukir Ahmed', 'Associate Professor'],
        ['Dr. Md Khaled Ben Islam', 'Associate Professor'],
        ['Md. Mursalin', 'Assistant Professor (On Study Leave)'],
        ['Md. Kislu Noman', 'Assistant Professor (On Study Leave)'],
        ['Md. Mahmudul Hasan', 'Assistant Professor (On Study Leave)'],
        ['Dr. Md. Niaz Imtiaz', 'Assistant Professor'],
        ['Nitun Kumar Podder', 'Assistant Professor'],
        ['Nakib Aman', 'Assistant Professor']
      ]
    },
    {
      department: 'Electrical and Electronic Engineering',
      teachers: [
        ['Dr. Dilip Kumar Sarker', 'Professor'],
        ['Diponkar Kundu', 'Professor'],
        ['Dr. Md. Masudur Rahman', 'Associate Professor (On Study Leave)'],
        ['Dr. Md. Rabiul Islam', 'Associate Professor (On Study Leave)'],
        ['Dr. T. H. M. Sumon Rashid', 'Associate Professor'],
        ['Dr. A.H.M. Iftekharul Ferdous', 'Associate Professor'],
        ['Dr. Md. Feroz Ali', 'Associate Professor'],
        ['Md. Golam Sadeque', 'Associate Professor'],
        ['Md. Motaher Hossain', 'Assistant Professor (On Study Leave)'],
        ['Md. Galib Hasan', 'Assistant Professor'],
        ['Nadia Afrin', 'Assistant Professor (On Study Leave)'],
        ['Md Asaduzzaman Shobug', 'Assistant Professor (On Study Leave)'],
        ['Rosni Sayed', 'Assistant Professor'],
        ['Md. Ariful Islam', 'Assistant Professor'],
        ['Md. Shamim Hossain', 'Assistant Professor'],
        ['Tonmoy Ghosh', 'Lecturer']
      ]
    },
    {
      department: 'Electrical, Electronic and Communication Engineering',
      teachers: [
        ['Dr. Md. Saiful Islam', 'Professor'],
        ['Dr. Sheikh Rashel Al Ahmed', 'Professor'],
        ['Dr. Md. Najmul Hossain', 'Professor'],
        ['Dr. Md. Rashedul Islam', 'Associate Professor'],
        ['Purno Mohon Ghosh', 'Assistant Professor (On Study Leave)'],
        ['S. M. Yahea Mahbub', 'Assistant Professor (On Study Leave)'],
        ['Liton Chandra Paul', 'Assistant Professor'],
        ['Md. Fatin Ishraque', 'Assistant Professor (On Study Leave)'],
        ['Md. Imran Hossain', 'Assistant Professor'],
        ['Kumary Sumi Rani Shaha', 'Assistant Professor'],
        ['Most. Marzia Khatun', 'Lecturer']
      ]
    },
    {
      department: 'Information and Communication Engineering',
      teachers: [
        ['Dr. Md. Anwar Hossain', 'Professor'],
        ['Dr. Md. Sarwar Hosain', 'Professor'],
        ['Dr. Md. Omar Faruk', 'Professor'],
        ['Dr. Pallab Kanti Podder', 'Associate Professor (On Study Leave)'],
        ['Iffat Ara', 'Associate Professor (On Study Leave)'],
        ['Sohag Sarker', 'Associate Professor'],
        ['Abul Fazal Mohammad Zainul Abadin', 'Associate Professor'],
        ['Dr. Md. Imran Hossain', 'Associate Professor'],
        ['Taskin Noor Turna', 'Assistant Professor'],
        ['Md. Tofail Ahmed', 'Assistant Professor (On Study Leave)'],
        ['Tarun Debnath', 'Assistant Professor'],
        ['Akif Mahdi', 'Lecturer (On Study Leave)']
      ]
    },
    {
      department: 'Civil Engineering',
      teachers: [
        ['Dr. Md. Rashedul Haque', 'Professor'],
        ['Dr. Tahmina Tasnim Nahar', 'Professor'],
        ['Dr. Md. Motiur Rahman', 'Associate Professor'],
        ['Md. Raquibul Hasan', 'Assistant Professor (On Study Leave)'],
        ['Md. Atauzzaman', 'Assistant Professor (On Study Leave)'],
        ['Md. Abir Hasan', 'Assistant Professor'],
        ['Ashish Kumer Shaha', 'Lecturer (On Study Leave)'],
        ['Tanmay Das', 'Lecturer (On Study Leave)'],
        ['Md. Rafiqul Islam', 'Lecturer'],
        ['Md. Nasim Sarkar', 'Lecturer']
      ]
    },
    {
      department: 'Architecture',
      teachers: [
        ['Laila Arzumand Banu', 'Assistant Professor'],
        ['Audity Biswas', 'Assistant Professor'],
        ['Bijoy Dash Gupta', 'Assistant Professor'],
        ['Jannat Ara Ferdousi', 'Assistant Professor'],
        ['Sarjana Afroz', 'Assistant Professor'],
        ['Sonjit Kumar Nath', 'Assistant Professor'],
        ['Zannatuge Jahan', 'Lecturer'],
        ['Sourav Ghosh', 'Lecturer'],
        ['Md. Mohaiminul Islam', 'Lecturer']
      ]
    },
    {
      department: 'Urban and Regional Planning',
      teachers: [
        ['Dr. Md. Ashrafuzzaman Pramanik', 'Associate Professor'],
        ['Md. Sohel Rana', 'Assistant Professor (On Study Leave)'],
        ['Dr. Md. Kamrul Hasan', 'Assistant Professor'],
        ['Ashraf Uddin Fahim', 'Assistant Professor (On Study Leave)'],
        ['Tasnim Tabassum', 'Assistant Professor (On Study Leave)'],
        ['Saimunnahar Ritu', 'Lecturer'],
        ['Mst. Tanzila Aktar Shawon', 'Lecturer'],
        ['Ferdous Hussain', 'Lecturer']
      ]
    },
    {
      department: 'Mathematics',
      teachers: [
        ['Dr. Md. Fazlul Hoque', 'Professor'],
        ['Dr. Kamruzzaman Khan', 'Professor'],
        ['Dr. Md. Nur Alam', 'Professor (On Study Leave)'],
        ['Rafiqul Islam', 'Associate Professor'],
        ['Dr. Md. Azizur Rahman', 'Associate Professor'],
        ['Dr. Udoy Sankar Basak', 'Associate Professor'],
        ['Dr. Md. Ekramul Islam', 'Associate Professor'],
        ['Md. Rafiqul Islam', 'Associate Professor'],
        ['Rajandra Chadra Bhowmik', 'Associate Professor'],
        ['S. M. Rayhanul Islam', 'Associate Professor'],
        ['Bimal Kumar Datta', 'Assistant Professor (On Study Leave)'],
        ['Kaniz Fatema', 'Assistant Professor (On Study Leave)'],
        ['Mousumi Akhter', 'Assistant Professor (On Study Leave)'],
        ['Md. Aslam Hossain', 'Assistant Professor']
      ]
    },
    {
      department: 'Physics',
      teachers: [
        ['Dr. Md. Khairul Alam', 'Professor'],
        ['Dr. Md. Aftabuzzaman', 'Professor'],
        ['Dr. Pretam Kumar Das', 'Professor'],
        ['Dr. Samiron Kumar Saha', 'Professor'],
        ['Dr. Md. Atikur Rahman', 'Professor'],
        ['Dr. Md. Shahajan Ali', 'Professor'],
        ['Dr. Md. Hafijur Rahman', 'Associate Professor'],
        ['Dr. Md. Lokman Ali', 'Associate Professor'],
        ['Mahmudul Hasan', 'Assistant Professor (On Study Leave)'],
        ['Md. Afjalur Rahman', 'Assistant Professor'],
        ['Uttam Kumar Chowdhury', 'Assistant Professor'],
        ['Md. Tofajjol Hossen Bhuiyan', 'Assistant Professor'],
        ['Maliha Nishat', 'Assistant Professor (On Study Leave)'],
        ['Dr. Dayal Chandra Roy', 'Assistant Professor']
      ]
    },
    {
      department: 'Chemistry',
      teachers: [
        ['Ratan Kumar Paul', 'Associate Professor'],
        ['Dr. Sultana Shakila Khan', 'Associate Professor'],
        ['Md. Faruak Ahmad', 'Associate Professor'],
        ['Md. Homayun Kabir', 'Assistant Professor'],
        ['Rasel Ahmed', 'Assistant Professor (On Study Leave)'],
        ['Md. Kawsar Hossain', 'Assistant Professor (Organic Chemistry)'],
        ['Dr. Tasmina Khandaker', 'Assistant Professor'],
        ['Abrar Yasir Abir', 'Lecturer'],
        ['Suprim Chandra Sarker', 'Lecturer'],
        ['Md. Mahabur Rahman', 'Lecturer'],
        ['Soma Saha', 'Lecturer'],
        ['Md. Byzed Hasan', 'Lecturer']
      ]
    },
    {
      department: 'Statistics and Data Science',
      teachers: [
        ['Dr. Md. Shamim Reza', 'Professor'],
        ['Dr. Sabba Ruhi', 'Professor'],
        ['Imran Parvez', 'Assistant Professor (On Study Leave)'],
        ['Md. Shahajada Mia', 'Assistant Professor (On Study Leave)'],
        ['A.H.M. Musfiqur Rahman Nabeen', 'Assistant Professor (On Study Leave)'],
        ['Most. Mira Khatun', 'Assistant Professor'],
        ['Most. Sonia Khatun', 'Lecturer (On Study Leave)'],
        ['Md. Miraj Hossain', 'Lecturer'],
        ['Dr. Md. Nasif Hossain', 'Lecturer'],
        ['Rubia Yasmin', 'Lecturer']
      ]
    },
    {
      department: 'Pharmacy',
      teachers: [
        ['Dr. Md. Shamim Reza', 'Professor'],
        ['Dr. Shariful Haque', 'Associate Professor'],
        ['Dr. Sm Faysal Bellah', 'Associate Professor'],
        ['Ashish Kumar Sarker', 'Assistant Professor (On Study Leave)'],
        ['Monirul Islam', 'Assistant Professor (On Study Leave)'],
        ['Md. Sanowar Hossain', 'Assistant Professor (On Study Leave)'],
        ['Most. Reshma Akter', 'Assistant Professor (On Study Leave)'],
        ['G.M. Masud Parvez', 'Lecturer (On Study Leave)'],
        ['Md. Ashraful Islam', 'Lecturer'],
        ['Abdul Ali Bhuiyan', 'Lecturer'],
        ['Md. Selim Uddin', 'Lecturer'],
        ['Md. Sabbir Hossain', 'Lecturer']
      ]
    },
    {
      department: 'Business Administration',
      teachers: [
        ['Dr. Md. Mushfiqur Rahman', 'Professor'],
        ['Dr. Md. Kamruzzaman', 'Professor'],
        ['Dr. Md. Amirul Islam', 'Professor'],
        ['Dr. Md. Hasebur Rahman', 'Professor'],
        ['Dr. Md. Redwanuzzaman', 'Professor'],
        ['Mohammad Abu Sufian', 'Professor'],
        ['Dr. Md. Abdullah Al Mamun', 'Professor'],
        ['Dr. Md. Asfaqur Rahman', 'Associate Professor (Management)'],
        ['Dr. Masud Rana', 'Associate Professor (Finance)'],
        ['Dr. Md. Kamal Hossain', 'Associate Professor (Marketing)'],
        ['Dr. Rebeka Sultana Rekha', 'Associate Professor (Finance)']
      ]
    },
    {
      department: 'Tourism and Hospitality Management',
      teachers: [
        ['Sraboni Bagchi', 'Assistant Professor'],
        ['Md. Ashikur Rahman Avi', 'Assistant Professor'],
        ['S. M. Shahedul Alam', 'Assistant Professor'],
        ['Mahfuza Sultana Fariha', 'Lecturer'],
        ['Rafatul Islam', 'Lecturer'],
        ['Md. Tanjil Hossen Sojib', 'Lecturer'],
        ['Jannatul Ferdous', 'Lecturer']
      ]
    },
    {
      department: 'Economics',
      teachers: [
        ['Dr. Mir Khaled Iqbal Chowdhury', 'Professor'],
        ['Redwan Ahmed', 'Associate Professor'],
        ['Md. Enamul Haque', 'Associate Professor'],
        ['Md. Yahia Bapari', 'Associate Professor (On Study Leave)'],
        ['Md. Al-Amin', 'Associate Professor'],
        ['Bikash Chandra Ghosh', 'Associate Professor'],
        ['Dr. Md. Tawhidul Islam', 'Associate Professor'],
        ['Tahmidul Islam', 'Assistant Professor'],
        ['Khaleda Akter', 'Assistant Professor'],
        ['Farjana Eyasmin', 'Assistant Professor'],
        ['Md. Nehal Hasnain', 'Assistant Professor'],
        ['Md. Obidul Haque', 'Lecturer']
      ]
    },
    {
      department: 'Bangla',
      teachers: [
        ['Dr. Mir Humayun Kabir', 'Professor'],
        ['Dr. Md. Abdul Alim', 'Professor'],
        ['Dr. Mohammad Arif Obaidullah', 'Associate Professor'],
        ['Dr. Jinnat Rehana', 'Associate Professor'],
        ['Dr. Md. Asraful Islam', 'Associate Professor'],
        ['Dr. Md. Tanvir Hyder', 'Associate Professor'],
        ['Muhammad Nurunnabi', 'Assistant Professor (On Study Leave)']
      ]
    },
    {
      department: 'English',
      teachers: [
        ['Dr. Md. Mokarrom Hossain', 'Associate Professor'],
        ['Rashed Mahmud', 'Associate Professor'],
        ['Sanjida Afrin', 'Assistant Professor (On Study Leave)'],
        ['Md. Rawshan Yeazdani', 'Assistant Professor'],
        ['Md. Mahamudul Hasan', 'Assistant Professor'],
        ['Shayla Akter', 'Assistant Professor'],
        ['Md. Ibrahim Khalil', 'Assistant Professor (On Study Leave)'],
        ['S.M. Ishmam Alam', 'Assistant Professor'],
        ['Nusrat Jahan Nova', 'Lecturer (On Study Leave)'],
        ['Sabiha Afrin Badhan', 'Lecturer']
      ]
    },
    {
      department: 'Social Work',
      teachers: [
        ['Dr. Md. Jahidul Islam', 'Associate Professor'],
        ['Mst. Khadezatul Kobra', 'Associate Professor'],
        ['Mst. Fatema Begum', 'Assistant Professor'],
        ['Md. Sohel Rana', 'Lecturer']
      ]
    },
    {
      department: 'Public Administration',
      teachers: [
        ['Md. Al-Fahad Bhuiyan', 'Associate Professor'],
        ['Bulbul Ahmed', 'Assistant Professor (On Study Leave)'],
        ['Most. Sangida Rahman', 'Assistant Professor'],
        ['Md. Miraz Hosen', 'Assistant Professor (On Study Leave)'],
        ['Tanveer Alam', 'Lecturer'],
        ['Nishat Tabassum', 'Lecturer'],
        ['Nishat Tasnim', 'Lecturer'],
        ['Shammy Islam', 'Lecturer'],
        ['Md. Ashek- A- Khoda', 'Lecturer']
      ]
    },
    {
      department: 'History',
      teachers: [
        ['Dr. Md. Habibullah', 'Professor'],
        ['Md. Shafiqur Rahaman', 'Associate Professor'],
        ['Mst. Rahena Begum', 'Assistant Professor (On Study Leave)'],
        ['Most. Shahanaz Parvin', 'Assistant Professor'],
        ['Afrin Jahan', 'Lecturer'],
        ['Md. Faruk Gazi', 'Lecturer'],
        ['Abu Tayeb', 'Lecturer'],
        ['Arjuna Akter', 'Lecturer']
      ]
    },
    {
      department: 'Geography and Environment',
      teachers: [
        ['Dr. Mohammad Najmul Islam', 'Professor'],
        ['Md Rahedul Islam (D. Eng.)', 'Professor'],
        ['A. H. M. Monzurul Mamun', 'Associate Professor'],
        ['Humayra Anjum', 'Associate Professor'],
        ['Khondakar Arifuzzaman', 'Assistant Professor'],
        ['Md. Abrar Tazwar Rijon', 'Lecturer'],
        ['Shekh Md. Shajid Hasan Tusher', 'Lecturer']
      ]
    }
  ];

  // Every designation that occurs above, ordered most-senior first, plus
  // "Chairman" (cover pages usually credit the department chairman).
  var DESIGNATIONS = [
    'Professor',
    'Associate Professor',
    'Assistant Professor',
    'Lecturer',
    'Chairman',
    'Professor (On Study Leave)',
    'Associate Professor (On Study Leave)',
    'Assistant Professor (On Study Leave)',
    'Lecturer (On Study Leave)',
    'Associate Professor (Management)',
    'Associate Professor (Finance)',
    'Associate Professor (Marketing)',
    'Assistant Professor (Organic Chemistry)'
  ];

  // Common student identifiers, offered as searchable suggestions.
  var SESSIONS = ['2019-20', '2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];
  var YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];
  var SEMESTERS = ['1st Semester', '2nd Semester', '3rd Semester', '4th Semester', '5th Semester', '6th Semester', '7th Semester', '8th Semester', '9th Semester', '10th Semester'];

  // Short forms used on the university website's own navigation, shown as
  // secondary hints in the department/teacher suggestion lists.
  var ABBR = {
    'Computer Science and Engineering': 'CSE',
    'Electrical and Electronic Engineering': 'EEE',
    'Electrical, Electronic and Communication Engineering': 'EECE',
    'Information and Communication Engineering': 'ICE',
    'Civil Engineering': 'CE',
    'Architecture': 'ARCH',
    'Urban and Regional Planning': 'URP',
    'Mathematics': 'MATH',
    'Physics': 'PHY',
    'Chemistry': 'CHEM',
    'Statistics and Data Science': 'STAT',
    'Pharmacy': 'PHARM',
    'Business Administration': 'BA',
    'Tourism and Hospitality Management': 'THM',
    'Economics': 'ECO',
    'Bangla': 'BAN',
    'English': 'ENG',
    'Social Work': 'SW',
    'Public Administration': 'PAD',
    'History': 'HIS',
    'Geography and Environment': 'GE'
  };

  function deptByName(name) {
    for (var i = 0; i < DEPARTMENTS.length; i++) if (DEPARTMENTS[i].name === name) return DEPARTMENTS[i];
    return null;
  }

  function facultyOf(deptName) {
    var d = deptByName(deptName);
    return d ? d.faculty : '';
  }

  // Flat list: every teacher with department + faculty resolved.
  var TEACHERS = [];
  TEACHER_GROUPS.forEach(function (group) {
    group.teachers.forEach(function (t) {
      TEACHERS.push({ name: t[0], designation: t[1], department: group.department, faculty: facultyOf(group.department) });
    });
  });

  root.CoverPustData = {
    UNIVERSITY_NAME: UNIVERSITY_NAME,
    SHORT_NAME: SHORT_NAME,
    LOGO_DATA_URL: LOGO_DATA_URL,
    FACULTIES: FACULTIES,
    DEPARTMENTS: DEPARTMENTS,
    ABBR: ABBR,
    TEACHERS: TEACHERS,
    DESIGNATIONS: DESIGNATIONS,
    SESSIONS: SESSIONS,
    YEARS: YEARS,
    SEMESTERS: SEMESTERS,
    deptByName: deptByName,
    facultyOf: facultyOf
  };
}(typeof window !== 'undefined' ? window : globalThis));
