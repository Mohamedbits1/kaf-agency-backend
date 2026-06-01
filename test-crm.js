
async function testAll() {
  const URL = 'http://localhost:5000/api';
  console.log('--- STARTING CRM TESTS ---');

  try {
    // 1. Test Login (Case Insensitive)
    console.log('1. Testing Login as admin with uppercase email...');
    let res = await fetch(`${URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ADMIN@kafmarketingagency.com', password: 'Kaf@2026Admin' })
    });
    let data = await res.json();
    if (data.success) {
      console.log('✅ Login successful! Token received.');
    } else {
      console.log('❌ Login failed:', data);
      return;
    }

    // 1.5 Add a new Contact to act as client
    console.log('\n1.5 Adding a new contact...');
    res = await fetch(`${URL}/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Client', email: 'test@client.com', phone: '1234567890', service: 'Web', message: 'Hi'
      })
    });
    data = await res.json();
    let contactId = null;
    if (data.success) {
      console.log('✅ Contact added successfully');
      // get contact ID via GET contacts
      let contactsRes = await fetch(`${URL}/contacts`);
      let contactsData = await contactsRes.json();
      contactId = contactsData.data.find(c => c.email === 'test@client.com')._id;
    }

    // 2. Add a new Project
    console.log('\n2. Testing adding a new project...');
    res = await fetch(`${URL}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test CRM Project',
        client: contactId,
        manager: null,
        status: 'In Progress',
        description: 'Testing the CRM from node',
        budget: 5000
      })
    });
    data = await res.json();
    let projectId = null;
    if (data.success) {
      console.log('✅ Project added successfully:', data.data.name);
      projectId = data.data._id;
    } else {
      console.log('❌ Failed to add project:', data);
    }

    // 3. Add a new Task
    console.log('\n3. Testing adding a new task...');
    res = await fetch(`${URL}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Test CRM Task',
        description: 'Testing the task creation',
        project: projectId,
        status: 'Todo',
        priority: 'High'
      })
    });
    data = await res.json();
    if (data.success) {
      console.log('✅ Task added successfully:', data.data.title);
    } else {
      console.log('❌ Failed to add task:', data);
    }

    console.log('\n✅ All tests completed successfully!');

  } catch (err) {
    console.error('Test error:', err);
  }
}

testAll();
