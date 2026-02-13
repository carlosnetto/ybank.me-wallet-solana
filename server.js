const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.text());

app.post('/generate', (req, res) => {
    try {
        const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        console.log('Received Charge Request:', payload);

        // This is a mock response. In a real scenario, you'd generate 
        // a specific payment URI or interact with a payment gateway.
        const mockQrContent = `ethereum:${payload.paymentMethods[0].networks.Base.address}@8453/transfer?address=${USDC_ADDRESS_BASE}&uint256=${payload.paymentMethods[0].amount}`;

        res.json({
            qrContent: mockQrContent,
            status: "SUCCESS"
        });
    } catch (e) {
        res.status(400).json({ error: "Invalid payload" });
    }
});

const PORT = 5010;
const USDC_ADDRESS_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

app.listen(PORT, () => {
    console.log(`QR App Server running at http://localhost:${PORT}`);
});