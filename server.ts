import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for sending monthly report
  app.post("/api/send-report", async (req, res) => {
    const { email, report, lang } = req.body;

    if (!email || !report) {
      return res.status(400).json({ error: "Missing email or report data" });
    }

    // Configure transporter
    // Note: User needs to provide these in .env
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const isMr = lang === 'mr';
    const subject = isMr 
      ? `तुमचा मासिक आर्थिक अहवाल - ${report.month}` 
      : `Your Monthly Financial Report - ${report.month}`;

    const htmlContent = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <div style="background-color: #ea580c; color: white; padding: 24px; text-align: center;">
          <h1 style="margin: 0;">${isMr ? "मासिक अहवाल" : "Monthly Report"}</h1>
          <p style="margin: 8px 0 0; opacity: 0.9;">${report.month}</p>
        </div>
        <div style="padding: 24px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
            <div style="background-color: #f0fdf4; padding: 16px; border-radius: 8px; border: 1px solid #bcf0da;">
              <p style="margin: 0; font-size: 12px; color: #166534; font-weight: bold; text-transform: uppercase;">${isMr ? "एकूण उत्पन्न" : "Total Income"}</p>
              <p style="margin: 4px 0 0; font-size: 24px; font-weight: bold; color: #166534;">₹${report.totalIncome.toLocaleString()}</p>
            </div>
            <div style="background-color: #fef2f2; padding: 16px; border-radius: 8px; border: 1px solid #fecaca;">
              <p style="margin: 0; font-size: 12px; color: #991b1b; font-weight: bold; text-transform: uppercase;">${isMr ? "एकूण खर्च" : "Total Expense"}</p>
              <p style="margin: 4px 0 0; font-size: 24px; font-weight: bold; color: #991b1b;">₹${report.totalExpense.toLocaleString()}</p>
            </div>
          </div>
          
          <div style="background-color: #fff7ed; padding: 16px; border-radius: 8px; border: 1px solid #ffedd5; margin-bottom: 24px; text-align: center;">
            <p style="margin: 0; font-size: 12px; color: #9a3412; font-weight: bold; text-transform: uppercase;">${isMr ? "शिल्लक (बचत)" : "Balance (Savings)"}</p>
            <p style="margin: 4px 0 0; font-size: 28px; font-weight: bold; color: #9a3412;">₹${report.balance.toLocaleString()}</p>
          </div>

          <h3 style="border-bottom: 2px solid #f3f4f6; padding-bottom: 8px; margin-bottom: 16px;">${isMr ? "वर्गवारीनुसार खर्च" : "Category Breakdown"}</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            ${Object.entries(report.categoryBreakdown).map(([cat, amt]) => `
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">${cat}</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; text-align: right; font-weight: bold;">₹${(amt as number).toLocaleString()}</td>
              </tr>
            `).join('')}
          </table>

          <h3 style="border-bottom: 2px solid #f3f4f6; padding-bottom: 8px; margin-bottom: 16px;">${isMr ? "कर्ज (उसनवारी) सारांश" : "Loan Summary"}</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div style="padding: 12px; background-color: #f9fafb; border-radius: 8px;">
              <p style="margin: 0; font-size: 11px; color: #6b7280;">${isMr ? "दिलेले" : "Lent"}</p>
              <p style="margin: 2px 0 0; font-weight: bold;">₹${report.loanSummary.lent.toLocaleString()}</p>
            </div>
            <div style="padding: 12px; background-color: #f9fafb; border-radius: 8px;">
              <p style="margin: 0; font-size: 11px; color: #6b7280;">${isMr ? "घेतलेले" : "Borrowed"}</p>
              <p style="margin: 2px 0 0; font-weight: bold;">₹${report.loanSummary.borrowed.toLocaleString()}</p>
            </div>
            <div style="padding: 12px; background-color: #f9fafb; border-radius: 8px;">
              <p style="margin: 0; font-size: 11px; color: #6b7280;">${isMr ? "परत आलेले" : "Returned"}</p>
              <p style="margin: 2px 0 0; font-weight: bold;">₹${report.loanSummary.returned.toLocaleString()}</p>
            </div>
            <div style="padding: 12px; background-color: #f9fafb; border-radius: 8px;">
              <p style="margin: 0; font-size: 11px; color: #6b7280;">${isMr ? "बाकी" : "Pending"}</p>
              <p style="margin: 2px 0 0; font-weight: bold; color: #ea580c;">₹${report.loanSummary.pending.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div style="background-color: #f9fafb; padding: 16px; text-align: center; font-size: 12px; color: #9ca3af;">
          ${isMr ? "हे ईमेल आपोआप व्युत्पन्न झाले आहे." : "This email was automatically generated."}
        </div>
      </div>
    `;

    try {
      if (!process.env.SMTP_USER) {
        console.log("SMTP not configured. Report content:");
        console.log(htmlContent);
        return res.json({ success: true, message: "Report generated (SMTP not configured, logged to console)" });
      }

      await transporter.sendMail({
        from: `"Family Finance" <${process.env.SMTP_USER}>`,
        to: email,
        subject: subject,
        html: htmlContent,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Failed to send email", error);
      res.status(500).json({ error: "Failed to send email" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
