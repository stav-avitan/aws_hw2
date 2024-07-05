const http = require('http');
const assert = require('assert');

const endPoint = 'Restau-LB8A1-QyqgDcC0w3tP-590979892.us-east-1.elb.amazonaws.com';
const port = 80;

const restaurantName = 'MyRes';
const cuisineName = [
    "A", "B", "C", "D"
];

const regionName = [
    "X", "Y", "Z", "W"
]

const numRequests = 10;

// Function to make HTTP requests
const makeRequest = (options, postData = null) => {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve({ statusCode: res.statusCode, data: data });
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        if (postData) {
            req.write(postData);
        }

        req.end();
    });
};

const testPostMethod = async (i) => {
    const RestaurantAName = restaurantName + i;
    const restaurant = { name: RestaurantAName, cuisine: cuisineName[(i % cuisineName.length)], region: regionName[(i % regionName.length)] };
    const postOptions = {
        hostname: endPoint,
        port: port,
        path: '/restaurants',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    };

    try {
        const startTime = process.hrtime();
        const postResponse = await makeRequest(postOptions, JSON.stringify(restaurant));
        const endTime = process.hrtime(startTime);
        const elapsedTimeInMs = ((endTime[0] * 1e9 + endTime[1]) / 1e6).toFixed(2);
        assert.strictEqual(postResponse.statusCode, 200, 'Expected POST status code to be 200');
        console.log(`POST ${postOptions.path}: Time Elapsed: ${elapsedTimeInMs}ms`);
        return ((endTime[0] * 1e9 + endTime[1]) / 1e6);
    } catch (err) {
        console.error('Error:', err);
        return 0.0;
    }
};

const testGetMethod = async (i) => {
    const RestaurantAName = restaurantName + i;

    const getOptions = {
        hostname: endPoint,
        port: port,
        path: `/restaurants/${RestaurantAName}`,
        method: 'GET'
    };

    try {
        const startTime = process.hrtime();
        const getResponse = await makeRequest(getOptions);
        const endTime = process.hrtime(startTime);
        const elapsedTimeInMs = ((endTime[0] * 1e9 + endTime[1]) / 1e6).toFixed(2);
        assert.strictEqual(getResponse.statusCode, 200, 'Expected GET status code to be 200');
        const responseData = JSON.parse(getResponse.data);
        assert.strictEqual(responseData.name, RestaurantAName, 'Expected restaurant name to match');
        assert.strictEqual(responseData.cuisine, cuisineName[(i % cuisineName.length)], 'Expected cuisine to match');
        assert.strictEqual(responseData.region, regionName[(i % regionName.length)], 'Expected region to match');
        console.log(`GET ${getOptions.path}: Time Elapsed: ${elapsedTimeInMs}ms`);
        return ((endTime[0] * 1e9 + endTime[1]) / 1e6);
    } catch (err) {
        console.error('Error:', err);
        return 0.0;
    }
};

const testGetComplexMethod = async (i) => {
    const getOptions = {
        hostname: endPoint,
        port: port,
        path: `/restaurants/cuisine/${cuisineName[(i % cuisineName.length)]}`,
        method: 'GET'
    };

    try {
        const startTime = process.hrtime();
        const getResponse = await makeRequest(getOptions);
        const endTime = process.hrtime(startTime);
        const elapsedTimeInMs = ((endTime[0] * 1e9 + endTime[1]) / 1e6).toFixed(2);
        assert.strictEqual(getResponse.statusCode, 200, 'Expected GET status code to be 200');
        console.log(`GET ${getOptions.path}: Time Elapsed: ${elapsedTimeInMs}ms`);
        return ((endTime[0] * 1e9 + endTime[1]) / 1e6);
    } catch (err) {
        console.error('Error:', err);
        return 0.0;
    }
};

const testDeleteMethod = async (i) => {
    const RestaurantAName = restaurantName + i;

    const deleteOptions = {
        hostname: endPoint,
        port: port,
        path: `/restaurants/${RestaurantAName}`,
        method: 'DELETE'
    };

    try {
        const startTime = process.hrtime();
        const deleteResponse = await makeRequest(deleteOptions);
        const endTime = process.hrtime(startTime);
        const elapsedTimeInMs = ((endTime[0] * 1e9 + endTime[1]) / 1e6).toFixed(2);
        assert.strictEqual(deleteResponse.statusCode, 200, 'Expected DELETE status code to be 200');
        const deleteResponseData = JSON.parse(deleteResponse.data);
        assert.deepStrictEqual(deleteResponseData, { success: true }, 'Expected success message');
        console.log(`DELETE ${deleteOptions.path}: Time Elapsed: ${elapsedTimeInMs}ms`);
        return ((endTime[0] * 1e9 + endTime[1]) / 1e6);
    } catch (err) {
        console.error('Error:', err);
        return 0.0;
    }
};

// Load test
const loadTest = async () => {
    console.log(`Starting load test with ${numRequests} requests`);

    let totalPost = 0.0;
    let totalGet = 0.0;
    let totalComplexGet = 0.0;
    let totalDelete = 0.0;

    console.log(`Testing POST method...`);
    for (let i = 1; i <= numRequests; i++) {
        const ret = await testPostMethod(i);
        totalPost += ret;
    }

    console.log(`Testing GET method...`);
    for (let i = 1; i <= numRequests; i++) {
        const ret = await testGetMethod(i);
        totalGet += ret;
    }

    console.log(`Testing GET method with complex query...`);
    for (let i = 1; i <= numRequests; i++) {
        const ret = await testGetComplexMethod(i);
        totalComplexGet += ret;
    }

    console.log(`Testing DELETE method...`);
    for (let i = 1; i <= numRequests; i++) {
        const ret = await testDeleteMethod(i);
        totalDelete += ret;
    }

    const avgTime = (((totalPost+totalGet+totalComplexGet+totalDelete))/(numRequests * 4)).toFixed(2);
    const avgPost = (totalPost/numRequests).toFixed(2);
    const avgGet = (totalGet/numRequests).toFixed(2);
    const avgComplexGet = (totalComplexGet/numRequests).toFixed(2);
    const avgDelete = (totalDelete/numRequests).toFixed(2);
    console.log(`Avarage time per request: ${avgTime}ms`);
    console.log(`Avarage time per POST request: ${avgPost}ms`);
    console.log(`Avarage time per GET request: ${avgGet}ms`);
    console.log(`Avarage time per Complex GET request: ${avgComplexGet}ms`);
    console.log(`Avarage time per DELETE request: ${avgDelete}ms`);
};

loadTest().catch(console.error);