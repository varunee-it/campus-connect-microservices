const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

describe('Part B: Configuration-Based Service Discovery Demonstration', () => {
    test('Proves gateway routes to a newly configured service URL upon restart with zero code change', async () => {
        // Step 1: Create Initial Backend Server on Port A
        let serverAHandled = false;
        const serverA = http.createServer((req, res) => {
            serverAHandled = true;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ location: 'SERVER_A', url: req.url }));
        });
        await new Promise(r => serverA.listen(0, r));
        const portA = serverA.address().port;

        // Step 2: Create Relocated Backend Server on Port B
        let serverBHandled = false;
        const serverB = http.createServer((req, res) => {
            serverBHandled = true;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ location: 'SERVER_B', url: req.url }));
        });
        await new Promise(r => serverB.listen(0, r));
        const portB = serverB.address().port;

        try {
            // Step 3: Configure Gateway with Destination A via environment variable
            process.env.USER_SERVICE_URL = `http://localhost:${portA}`;
            delete require.cache[require.resolve('../server')];
            let app = require('../server');
            let gateway1 = http.createServer(app);
            await new Promise(r => gateway1.listen(0, r));
            let gwPort1 = gateway1.address().port;

            // Send request to Gateway -> should reach Server A
            let res1 = await fetch(`http://localhost:${gwPort1}/users/demo`);
            let data1 = await res1.json();
            assert.equal(res1.status, 200);
            assert.equal(data1.location, 'SERVER_A');
            assert.equal(serverAHandled, true);
            assert.equal(serverBHandled, false);
            await new Promise(r => gateway1.close(r));

            // Step 4: Reconfigure Service Discovery URL to Destination B (NO CODE CHANGE)
            process.env.USER_SERVICE_URL = `http://localhost:${portB}`;
            delete require.cache[require.resolve('../server')];
            app = require('../server');
            let gateway2 = http.createServer(app);
            await new Promise(r => gateway2.listen(0, r));
            let gwPort2 = gateway2.address().port;

            // Send same request to Gateway -> should now reach Server B
            let res2 = await fetch(`http://localhost:${gwPort2}/users/demo`);
            let data2 = await res2.json();
            assert.equal(res2.status, 200);
            assert.equal(data2.location, 'SERVER_B');
            assert.equal(serverBHandled, true);
            await new Promise(r => gateway2.close(r));

        } finally {
            await new Promise(r => serverA.close(r));
            await new Promise(r => serverB.close(r));
        }
    });
});
