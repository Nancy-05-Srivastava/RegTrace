// SyntheticBank-360: a fictional bank ("Meridian Straits Bank") operating in Singapore and India.
// Every node and edge below is synthetic. The library obligations are short paraphrased summaries of
// well-known MAS / RBI / Indian requirements, written for this demo – they are not legal text.
import { RNG } from './rng.js';
import { tokenize, topicsOf, TOPICS as TOPIC_KEYS } from './text.js';

export const LAYERS = ['regulation', 'policy', 'process', 'system', 'api', 'datastore', 'control', 'evidence', 'team'];
export const LAYER_LABEL = {
  regulation: 'Regulations', policy: 'Policies', process: 'Business processes', system: 'Systems & services', api: 'APIs',
  datastore: 'Data stores', control: 'Compliance controls', evidence: 'Audit evidence', team: 'Owning teams',
};
// Impact flows along these edge types (weight = how much of the impact passes through).
export const EDGE_W = {
  governs: 0.88, runs_on: 0.82, exposes: 0.72, calls: 0.5, stores: 0.62, controlled_by: 0.86, monitored_by: 0.76,
  protects: 0.7, evidenced_by: 0.9, owned_by: 1.0, satisfied_by: 0.85, implemented_in: 0.8,
};
export const EDGE_LABEL = {
  governs: 'governs', runs_on: 'runs on', exposes: 'exposes', calls: 'calls', stores: 'stores data in', controlled_by: 'is controlled by',
  monitored_by: 'is monitored by', protects: 'is protected by', evidenced_by: 'is evidenced by', owned_by: 'is owned by',
  satisfied_by: 'is satisfied by', implemented_in: 'is implemented in',
};

const TEAMS = [
  ['t_digital', 'Retail Digital'], ['t_payeng', 'Payments Engineering'], ['t_xbops', 'Cross-Border Operations'],
  ['t_fcc', 'Financial Crime Compliance'], ['t_infosec', 'Group Information Security'], ['t_dpo', 'Data Protection Office'],
  ['t_cloud', 'Cloud & Platform Engineering'], ['t_core', 'Core Banking Technology'], ['t_cards', 'Cards & Tokenisation'],
  ['t_lend', 'Digital Lending'], ['t_opsSG', 'Operations Singapore'], ['t_opsIN', 'Operations India'],
  ['t_regrep', 'Regulatory Reporting'], ['t_tprm', 'Third-Party Risk Management'], ['t_resil', 'IT Resilience'], ['t_fraud', 'Fraud Risk Management'],
];

// Shared platform systems used by many domains.
const SHARED_SYSTEMS = [
  ['sys_mobile', 'Mobile Banking App', 'Customer mobile app for Singapore and India: login, transfers, payees, cards, limits and security settings.', 't_digital', 3, ['GET /app/config', 'POST /app/security/settings'], ['ds_session'], ['sys_apigw']],
  ['sys_ib', 'Internet Banking Portal', 'Web banking portal for retail customers: login, payments, statements and profile management.', 't_digital', 3, ['GET /ib/dashboard'], ['ds_session'], ['sys_apigw']],
  ['sys_apigw', 'API Gateway', 'Central gateway that routes and secures all external and partner API traffic.', 't_cloud', 3, [], [], ['sys_authsvc', 'sys_pgw', 'sys_payee', 'sys_onb', 'sys_cms', 'sys_los', 'sys_consent', 'sys_ks', 'sys_limits']],
  ['sys_iam', 'Identity & Access Management', 'Directory, roles and access policies for customers and staff.', 't_infosec', 3, ['POST /iam/tokens'], ['ds_cred'], []],
  ['sys_core', 'Core Banking Ledger', 'System of record for accounts, balances and postings in both countries.', 't_core', 3, ['POST /ledger/postings', 'GET /accounts/{id}/balance'], ['ds_ledger'], ['sys_lake']],
  ['sys_c360', 'Customer 360 Service', 'Single customer view combining profile, KYC status, risk rating and products.', 't_core', 2, ['GET /customers/{id}', 'PATCH /customers/{id}'], ['ds_custSG', 'ds_custIN'], ['sys_lake']],
  ['sys_notify', 'Notification Service', 'Sends SMS, email and push notifications to customers.', 't_digital', 2, ['POST /notifications'], [], []],
  ['sys_lake', 'Enterprise Data Platform', 'Ingests operational data for analytics, reporting and model training.', 't_cloud', 2, ['POST /data/ingest', 'GET /data/datasets/{id}'], ['ds_lake_raw', 'ds_lake_cur'], []],
];
const SHARED_STORES = [
  ['ds_ledger', 'Transaction Ledger DB', 'Postings, balances and transaction history.', 'Global', 't_core', 3],
  ['ds_custSG', 'Customer Master – Singapore', 'Personal data of Singapore customers, hosted in Singapore.', 'SG', 't_core', 3],
  ['ds_custIN', 'Customer Master – India', 'Personal data of Indian customers, hosted in India.', 'IN', 't_core', 3],
  ['ds_session', 'Session Store', 'Active login sessions and tokens for digital channels.', 'Global', 't_digital', 2],
  ['ds_cred', 'Credential Vault', 'Hashed credentials, biometric templates and authentication secrets.', 'Global', 't_infosec', 3],
  ['ds_lake_raw', 'Data Lake – Raw Zone', 'Raw copies of operational data including personal data.', 'Global', 't_cloud', 2],
  ['ds_lake_cur', 'Data Lake – Curated Zone', 'Cleaned, joined data used for analytics and models.', 'Global', 't_cloud', 2],
];

// Domain packs. Tuples:
//  policies:  [id, name, desc]
//  processes: [id, name, desc, region, owner, [systems], policyId]
//  systems:   [id, name, desc, owner, criticality, [apis], [stores], [calls]]
//  stores:    [id, name, desc, region, owner, criticality]
//  controls:  [id, code, name, desc, [targets]]
const PACKS = [
  {
    topic: 'auth', team: 't_infosec',
    policies: [
      ['pol_access', 'Access Management Standard', 'Authentication, session management and privileged access requirements for customers and staff.'],
      ['pol_auth_cust', 'Customer Authentication Policy', 'Customer login, OTP, biometric, device binding and risk-based step-up authentication for digital channels and high-risk transactions.'],
    ],
    processes: [
      ['prc_login', 'Customer login & session management', 'Customers log in to mobile and internet banking with two factors; sessions are created, timed out and terminated.', 'Global', 't_digital', ['sys_mobile', 'sys_ib', 'sys_authsvc', 'sys_iam'], 'pol_auth_cust'],
      ['prc_stepup', 'Risk-based step-up authentication', 'High-risk actions such as adding a payee, raising limits or a cross-border transfer trigger OTP or biometric authentication.', 'Global', 't_digital', ['sys_authsvc', 'sys_otp', 'sys_risk'], 'pol_auth_cust'],
      ['prc_device', 'Device binding & SIM verification', 'A new device is bound to the customer account after SIM check and OTP, followed by a cooling-off period.', 'Global', 't_digital', ['sys_devbind', 'sys_otp', 'sys_mobile'], 'pol_auth_cust'],
      ['prc_privaccess', 'Privileged access review', 'Staff privileged access to production systems is requested, approved, recorded and reviewed.', 'Global', 't_infosec', ['sys_pam', 'sys_iam'], 'pol_access'],
      ['prc_pwreset', 'Credential reset & account recovery', 'Customers recover access after identity re-verification; resets are notified to the customer.', 'Global', 't_digital', ['sys_authsvc', 'sys_notify', 'sys_otp'], 'pol_auth_cust'],
    ],
    systems: [
      ['sys_authsvc', 'Authentication Service', 'Authenticates customers with password, OTP, biometrics and risk-based step-up.', 't_infosec', 3, ['POST /auth/login', 'POST /auth/step-up', 'POST /auth/biometric'], ['ds_cred', 'ds_session'], ['sys_otp', 'sys_devbind', 'sys_risk']],
      ['sys_otp', 'OTP Gateway', 'Generates and verifies one-time passwords over SMS and in-app.', 't_infosec', 3, ['POST /otp/send', 'POST /otp/verify'], [], ['sys_notify']],
      ['sys_devbind', 'Device Binding Service', 'Binds devices and SIMs to customer accounts and tracks device trust.', 't_digital', 3, ['POST /devices/bind', 'GET /devices/{id}/trust'], ['ds_devreg'], []],
      ['sys_pam', 'Privileged Access Manager', 'Vaults and brokers privileged staff credentials with session recording.', 't_infosec', 2, ['POST /pam/checkout'], ['ds_audit'], []],
      ['sys_risk', 'Risk Scoring Engine', 'Scores sessions and transactions using device, behaviour and history signals.', 't_fraud', 3, ['POST /risk/score'], ['ds_fraud'], []],
    ],
    stores: [['ds_devreg', 'Device Registry', 'Bound devices, SIM identifiers and device trust status per customer.', 'Global', 't_digital', 2]],
    controls: [
      ['ctl_ac01', 'AC-01', 'Two-factor authentication for customer login', 'Customers must pass two authentication factors before accessing digital banking.', ['prc_login', 'sys_authsvc']],
      ['ctl_ac02', 'AC-02', 'Step-up authentication for high-risk transactions', 'Adding payees, raising limits and cross-border transfers require dynamic OTP or biometric authentication.', ['prc_stepup', 'sys_authsvc', 'sys_otp']],
      ['ctl_ac03', 'AC-03', 'Device binding with SIM verification and cooling-off', 'A new device is bound only after SIM verification; high-risk actions are blocked for a cooling-off period.', ['prc_device', 'sys_devbind']],
      ['ctl_ac04', 'AC-04', 'Session timeout after inactivity', 'Inactive digital banking sessions are terminated automatically.', ['prc_login', 'sys_mobile', 'sys_ib']],
      ['ctl_ac05', 'AC-05', 'Quarterly privileged access review', 'Privileged access rights are reviewed and recertified every quarter.', ['prc_privaccess', 'sys_pam']],
      ['ctl_ac06', 'AC-06', 'OTP validity and retry limits', 'OTPs expire quickly and lock after repeated failures.', ['sys_otp']],
      ['ctl_ac07', 'AC-07', 'Secure credential reset with re-verification', 'Credential resets need identity re-verification and notify the customer.', ['prc_pwreset']],
    ],
  },
  {
    topic: 'payments', team: 't_payeng',
    policies: [
      ['pol_xb', 'Cross-Border Payments Policy', 'Outward and inward remittances, UPI–PayNow linked transfers, FX conversion, payee checks, limits and payment data storage.'],
      ['pol_paylimits', 'Payment Limits & Velocity Standard', 'Daily, per-transaction and new-payee limits for retail transfers and customer-set limits.'],
    ],
    processes: [
      ['prc_outrem', 'Outward remittance Singapore → India', 'Customer in Singapore sends money to an Indian account; quote, FX, screening and transfer.', 'SG', 't_xbops', ['sys_xbhub', 'sys_paynow', 'sys_fx', 'sys_mobile', 'sys_core'], 'pol_xb'],
      ['prc_inrem', 'Inward remittance crediting (India)', 'Funds arriving from Singapore are validated and credited to Indian accounts.', 'IN', 't_opsIN', ['sys_xbhub', 'sys_upi', 'sys_core'], 'pol_xb'],
      ['prc_upipaynow', 'UPI–PayNow linked transfer', 'Real-time cross-border transfer between UPI and PayNow using mobile number or VPA proxies.', 'Global', 't_xbops', ['sys_upi', 'sys_paynow', 'sys_xbhub', 'sys_pgw'], 'pol_xb'],
      ['prc_payee', 'Payee registration & management', 'Customers add, verify and remove payees, including overseas beneficiaries.', 'Global', 't_digital', ['sys_payee', 'sys_mobile', 'sys_authsvc'], 'pol_paylimits'],
      ['prc_limits', 'Transfer limit management', 'Customers view and change daily and cross-border transfer limits in the app.', 'Global', 't_digital', ['sys_limits', 'sys_mobile'], 'pol_paylimits'],
      ['prc_recon', 'Cross-border settlement & reconciliation', 'Daily settlement with partner switches and reconciliation of cross-border payments.', 'Global', 't_xbops', ['sys_recon', 'sys_core', 'sys_xbhub'], 'pol_xb'],
      ['prc_paystatus', 'Payment status tracking & notification', 'Customers track transfers and receive status notifications for outgoing payments.', 'Global', 't_digital', ['sys_notify', 'sys_xbhub'], 'pol_xb'],
    ],
    systems: [
      ['sys_pgw', 'Payment Gateway', 'Accepts and orchestrates retail payment instructions from all channels.', 't_payeng', 3, ['POST /payments', 'POST /payments/cross-border', 'GET /payments/{id}'], ['ds_ledger'], ['sys_xbhub', 'sys_fraud', 'sys_core']],
      ['sys_xbhub', 'Cross-Border Payment Hub', 'Quotes, screens and routes cross-border payments; builds ISO 20022 messages.', 't_payeng', 3, ['POST /xb/quote', 'POST /xb/transfer', 'POST /xb/iso20022/pacs008'], ['ds_payIN', 'ds_paySG', 'ds_iso'], ['sys_upi', 'sys_paynow', 'sys_fx', 'sys_screen', 'sys_fraud', 'sys_core']],
      ['sys_upi', 'UPI Switch Adapter', 'Connects the bank to the UPI network for India-side legs.', 't_payeng', 3, ['POST /upi/pay', 'POST /upi/validate-vpa'], ['ds_payIN'], []],
      ['sys_paynow', 'PayNow Adapter', 'Connects to PayNow for Singapore-side legs and proxy lookup.', 't_payeng', 3, ['POST /paynow/proxy-lookup', 'POST /paynow/transfer'], ['ds_paySG'], []],
      ['sys_fx', 'FX Rate Service', 'Provides SGD/INR rates and margins for quotes.', 't_payeng', 2, ['GET /fx/rates'], [], []],
      ['sys_payee', 'Payee Management Service', 'Stores payees, verifies names and enforces new-payee rules.', 't_payeng', 3, ['POST /payees', 'POST /payees/{id}/verify-name', 'DELETE /payees/{id}'], ['ds_payee'], ['sys_notify']],
      ['sys_limits', 'Limits Service', 'Holds and enforces customer and product transfer limits.', 't_payeng', 2, ['GET /limits', 'PUT /limits'], ['ds_ledger'], []],
      ['sys_recon', 'Reconciliation Engine', 'Matches settlement files with ledger postings.', 't_xbops', 2, ['POST /recon/runs'], ['ds_iso'], []],
    ],
    stores: [
      ['ds_payIN', 'Payment Data Store – India region', 'Cross-border payment records for the India leg, hosted in India.', 'IN', 't_payeng', 3],
      ['ds_paySG', 'Payment Data Store – Singapore', 'Cross-border payment records for the Singapore leg.', 'SG', 't_payeng', 3],
      ['ds_iso', 'ISO 20022 Message Archive', 'Archived pacs/camt payment messages.', 'Global', 't_payeng', 2],
      ['ds_payee', 'Payee Registry', 'Customer payees with verification status and creation time.', 'Global', 't_payeng', 2],
    ],
    controls: [
      ['ctl_py01', 'PY-01', 'Cooling-off period for newly added payees', 'Transfers to a newly added payee are held or capped for a cooling-off period.', ['prc_payee', 'sys_payee']],
      ['ctl_py02', 'PY-02', 'Cross-border transfer limits per customer', 'Daily cross-border limits apply and customers can lower or disable them.', ['prc_limits', 'sys_limits', 'prc_outrem']],
      ['ctl_py03', 'PY-03', 'Payee name confirmation before transfer', 'The beneficiary name returned by the receiving bank is shown before the customer confirms.', ['prc_payee', 'sys_paynow', 'sys_upi']],
      ['ctl_py04', 'PY-04', 'Payment data stored only in India', 'India-leg payment data is stored only in Indian systems; foreign copies are deleted promptly.', ['ds_payIN', 'sys_xbhub']],
      ['ctl_py05', 'PY-05', 'Daily cross-border reconciliation', 'Breaks between settlement and ledger are resolved daily.', ['prc_recon', 'sys_recon']],
      ['ctl_py06', 'PY-06', 'Real-time transaction alerts to customers', 'Customers receive an alert for every outgoing transfer with amount and payee.', ['prc_paystatus', 'sys_notify']],
      ['ctl_py07', 'PY-07', 'ISO 20022 message validation', 'Outgoing payment messages are validated against schema and data rules.', ['sys_xbhub']],
    ],
  },
  {
    topic: 'kyc', team: 't_fcc',
    policies: [['pol_cdd', 'Customer Due Diligence Policy', 'KYC, customer due diligence, enhanced due diligence, beneficial ownership and periodic KYC refresh.']],
    processes: [
      ['prc_onb_sg', 'Customer onboarding – Singapore', 'Digital account opening in Singapore with national digital identity data and identity verification.', 'SG', 't_opsSG', ['sys_onb', 'sys_ekyc', 'sys_c360', 'sys_ndi', 'sys_screen'], 'pol_cdd'],
      ['prc_onb_in', 'Customer onboarding – India', 'Digital account opening in India with eKYC, central KYC records and video KYC.', 'IN', 't_opsIN', ['sys_onb', 'sys_ekyc', 'sys_vkyc', 'sys_ckyc', 'sys_screen'], 'pol_cdd'],
      ['prc_vkyc', 'Video-based customer identification', 'Live video KYC with liveness check, geo-tagging and document capture.', 'IN', 't_opsIN', ['sys_vkyc'], 'pol_cdd'],
      ['prc_kycrefresh', 'Periodic KYC refresh', 'KYC records are refreshed on a schedule based on customer risk rating.', 'Global', 't_fcc', ['sys_c360', 'sys_onb', 'sys_crr'], 'pol_cdd'],
      ['prc_edd', 'Enhanced due diligence for high-risk customers', 'High-risk and PEP customers go through enhanced checks and senior approval.', 'Global', 't_fcc', ['sys_c360', 'sys_crr', 'sys_screen'], 'pol_cdd'],
      ['prc_bo', 'Beneficial owner identification', 'Ownership structure of entity customers is captured and beneficial owners verified.', 'Global', 't_fcc', ['sys_onb', 'sys_c360'], 'pol_cdd'],
    ],
    systems: [
      ['sys_onb', 'Onboarding Orchestrator', 'Runs digital account-opening journeys and KYC workflow.', 't_digital', 3, ['POST /onboarding/applications', 'POST /onboarding/{id}/verify'], ['ds_kycdocs'], ['sys_c360', 'sys_ekyc']],
      ['sys_ekyc', 'eKYC Verification Service', 'Verifies identity documents and identity numbers against official sources.', 't_fcc', 3, ['POST /ekyc/verify'], ['ds_kycdocs'], []],
      ['sys_vkyc', 'Video-KYC Platform', 'Video customer identification with liveness detection and geo-location capture.', 't_opsIN', 3, ['POST /vkyc/sessions'], ['ds_kycdocs', 'ds_custIN'], []],
      ['sys_ndi', 'National Digital Identity Connector (SG)', 'Retrieves verified personal data from the Singapore national digital identity service with consent.', 't_digital', 2, ['GET /ndi/person'], ['ds_custSG'], []],
      ['sys_ckyc', 'Central KYC Registry Connector (IN)', 'Uploads and downloads KYC records from the Indian central KYC registry.', 't_opsIN', 2, ['POST /ckyc/upload', 'GET /ckyc/records/{id}'], ['ds_custIN'], []],
      ['sys_crr', 'Customer Risk Rating Engine', 'Calculates customer money-laundering risk rating.', 't_fcc', 2, ['POST /crr/score'], ['ds_custSG', 'ds_custIN'], []],
    ],
    stores: [['ds_kycdocs', 'KYC Document Store', 'Identity documents, video KYC recordings and verification results.', 'Global', 't_fcc', 3]],
    controls: [
      ['ctl_ky01', 'KY-01', 'Identity verification before account opening', 'No account is opened before identity is verified from reliable sources.', ['prc_onb_sg', 'prc_onb_in', 'sys_ekyc']],
      ['ctl_ky02', 'KY-02', 'Video-KYC liveness and geo-tagging checks', 'Video KYC sessions must pass liveness detection and capture customer location.', ['prc_vkyc', 'sys_vkyc']],
      ['ctl_ky03', 'KY-03', 'Risk-based periodic KYC refresh', 'KYC is refreshed every 2, 8 or 10 years depending on risk rating.', ['prc_kycrefresh']],
      ['ctl_ky04', 'KY-04', 'Beneficial owner verification', 'Beneficial owners of entity customers are identified and verified.', ['prc_bo']],
      ['ctl_ky05', 'KY-05', 'EDD sign-off for high-risk customers', 'High-risk customers need enhanced due diligence and senior management approval.', ['prc_edd', 'sys_crr']],
      ['ctl_ky06', 'KY-06', 'Customer risk rating recalculation', 'Risk ratings are recalculated on trigger events and at refresh.', ['sys_crr']],
    ],
  },
  {
    topic: 'aml', team: 't_fcc',
    policies: [
      ['pol_aml', 'AML/CFT Policy', 'Transaction monitoring, suspicious transaction reporting, record keeping and countering terrorism financing.'],
      ['pol_sanctions', 'Sanctions Compliance Standard', 'Screening of customers and payments against sanctions and PEP lists.'],
    ],
    processes: [
      ['prc_tm', 'Transaction monitoring alert triage', 'Monitoring alerts are reviewed, investigated and closed or escalated.', 'Global', 't_fcc', ['sys_tm', 'sys_case'], 'pol_aml'],
      ['prc_str', 'Suspicious transaction reporting', 'Suspicious transaction reports are prepared and filed with the financial intelligence unit.', 'Global', 't_fcc', ['sys_case', 'sys_strgw'], 'pol_aml'],
      ['prc_screen', 'Sanctions & PEP screening', 'Customers and payments are screened against sanctions and PEP lists in real time.', 'Global', 't_fcc', ['sys_screen'], 'pol_sanctions'],
      ['prc_records', 'AML record keeping', 'Customer and transaction records are kept for the retention period required by law.', 'Global', 't_fcc', ['sys_core', 'sys_lake'], 'pol_aml'],
    ],
    systems: [
      ['sys_tm', 'Transaction Monitoring Engine', 'Runs AML scenarios and mule typology rules on transactions.', 't_fcc', 3, ['POST /tm/events', 'GET /tm/alerts'], ['ds_alerts'], ['sys_case']],
      ['sys_case', 'Case Management System', 'Investigation workflow for AML, fraud and scam cases.', 't_fcc', 2, ['POST /cases', 'PATCH /cases/{id}'], ['ds_alerts'], []],
      ['sys_screen', 'Sanctions Screening Engine', 'Name and payment screening against sanctions and PEP lists.', 't_fcc', 3, ['POST /screening/names', 'POST /screening/payments'], ['ds_watch'], []],
      ['sys_strgw', 'STR Filing Gateway', 'Submits suspicious transaction reports to the Singapore and India FIUs.', 't_fcc', 2, ['POST /str/submit'], ['ds_alerts'], []],
    ],
    stores: [
      ['ds_alerts', 'Alert & Case DB', 'Monitoring alerts, investigations and filed reports.', 'Global', 't_fcc', 2],
      ['ds_watch', 'Watchlist Store', 'Sanctions, PEP and internal watchlists.', 'Global', 't_fcc', 2],
    ],
    controls: [
      ['ctl_tm01', 'TM-01', 'Cross-border velocity monitoring rule', 'Alerts on rapid in-and-out cross-border flows.', ['sys_tm', 'prc_tm']],
      ['ctl_tm02', 'TM-02', 'Alert disposition within SLA', 'Monitoring alerts are dispositioned within the service level.', ['prc_tm']],
      ['ctl_tm03', 'TM-03', 'STR filing within regulatory deadline', 'Suspicious transaction reports are filed promptly and within the legal deadline.', ['prc_str', 'sys_strgw']],
      ['ctl_tm04', 'TM-04', 'Real-time sanctions screening of cross-border payments', 'Every cross-border payment is screened before release.', ['prc_screen', 'sys_screen', 'sys_xbhub']],
      ['ctl_tm05', 'TM-05', 'Record retention for at least 5 years', 'AML records are retained for at least five years.', ['prc_records']],
      ['ctl_tm06', 'TM-06', 'Mule account typology rules', 'Detection rules for money mule behaviour on receiving and pass-through accounts.', ['sys_tm']],
    ],
  },
  {
    topic: 'fraud', team: 't_fraud',
    policies: [['pol_fraud', 'Fraud & Scam Risk Management Policy', 'Prevention, detection and response for scams, money mules and account takeover, including customer safeguards, kill switch and annual board reporting on the effectiveness of anti-scam controls.']],
    processes: [
      ['prc_fraudcase', 'Fraud case management', 'Fraud alerts and customer claims are investigated and resolved.', 'Global', 't_fraud', ['sys_case', 'sys_fraud'], 'pol_fraud'],
      ['prc_killswitch', 'Customer self-service kill switch', 'Customers can immediately freeze digital access and payments if they suspect a scam.', 'Global', 't_digital', ['sys_ks', 'sys_mobile', 'sys_ib'], 'pol_fraud'],
      ['prc_scamreport', 'Scam reporting & fund recovery', 'Scam victims report incidents; the bank acknowledges and attempts recovery with the receiving bank.', 'Global', 't_fraud', ['sys_case', 'sys_notify'], 'pol_fraud'],
      ['prc_freeze', 'Mule account freeze & restriction', 'Accounts identified as mules are restricted and funds held pending investigation.', 'Global', 't_fraud', ['sys_core', 'sys_case', 'sys_tm'], 'pol_fraud'],
      ['prc_rtfraud', 'Real-time payment fraud scoring', 'Outgoing payments are scored in real time and risky ones held for review.', 'Global', 't_fraud', ['sys_fraud', 'sys_pgw', 'sys_risk'], 'pol_fraud'],
    ],
    systems: [
      ['sys_fraud', 'Fraud Scoring API', 'Machine-learning fraud scores for payments using behaviour and device signals.', 't_fraud', 3, ['POST /fraud/score', 'POST /fraud/feedback'], ['ds_fraud'], ['sys_risk']],
      ['sys_ks', 'Kill Switch Service', 'Freezes all channels and payments for a customer on request.', 't_digital', 3, ['POST /security/kill-switch'], [], ['sys_core', 'sys_iam', 'sys_notify']],
    ],
    stores: [['ds_fraud', 'Fraud Feature Store', 'Behavioural, device and transaction features for fraud models.', 'Global', 't_fraud', 2]],
    controls: [
      ['ctl_fr01', 'FR-01', 'Real-time fraud scoring of outgoing transfers', 'All outgoing transfers are scored before release and high scores are held.', ['prc_rtfraud', 'sys_fraud']],
      ['ctl_fr02', 'FR-02', 'Kill switch to freeze all channels', 'Customers can freeze all digital access and payments instantly.', ['prc_killswitch', 'sys_ks']],
      ['ctl_fr03', 'FR-03', 'Scam reports acknowledged within 24 hours', 'Every scam report is acknowledged and a recovery request raised within 24 hours.', ['prc_scamreport']],
      ['ctl_fr04', 'FR-04', 'Mule account freeze workflow', 'Suspected mule accounts are restricted and escalated within one business day.', ['prc_freeze']],
      ['ctl_fr05', 'FR-05', 'Customer alert on device or contact change', 'Customers are notified when a device, phone number or email is changed.', ['sys_notify', 'prc_device']],
      ['ctl_fr06', 'FR-06', 'Fraud model performance review', 'Effectiveness of fraud and anti-scam controls is tested every year and reported to the board.', ['sys_fraud']],
    ],
  },
  {
    topic: 'privacy', team: 't_dpo',
    policies: [
      ['pol_privacy', 'Data Protection & Privacy Policy', 'Personal data processing, consent, purpose limitation, data subject rights, cross-border transfer, breach notification and appointment of a Data Protection Officer under PDPA and the DPDP Act.'],
      ['pol_retention', 'Record Retention & Disposal Standard', 'Retention periods and secure disposal for customer and transaction records.'],
    ],
    processes: [
      ['prc_consent', 'Consent capture & withdrawal', 'Consent for each purpose is captured in channels and can be withdrawn.', 'Global', 't_dpo', ['sys_consent', 'sys_mobile', 'sys_ib'], 'pol_privacy'],
      ['prc_dsr', 'Data subject request handling', 'Requests to access, correct or erase personal data are logged and fulfilled.', 'Global', 't_dpo', ['sys_dsr', 'sys_c360'], 'pol_privacy'],
      ['prc_breach', 'Personal data breach notification', 'Breaches are assessed and notified to regulators and affected individuals.', 'Global', 't_dpo', ['sys_siem', 'sys_itsm', 'sys_notify'], 'pol_privacy'],
      ['prc_dispose', 'Data retention & disposal', 'Data past its retention period is deleted or anonymised.', 'Global', 't_dpo', ['sys_lake', 'sys_core'], 'pol_retention'],
      ['prc_xfer', 'Cross-border personal data transfer assessment', 'Transfers of personal data abroad are assessed and safeguarded.', 'Global', 't_dpo', ['sys_lake', 'sys_xbhub'], 'pol_privacy'],
    ],
    systems: [
      ['sys_consent', 'Consent Manager', 'Records consent per purpose and exposes consent status to other systems.', 't_dpo', 3, ['POST /consents', 'DELETE /consents/{id}', 'GET /consents/{customer}'], ['ds_consent'], []],
      ['sys_dsr', 'Privacy Request Portal', 'Intake and tracking of data subject requests.', 't_dpo', 2, ['POST /privacy/requests'], ['ds_consent'], ['sys_c360']],
      ['sys_dlp', 'Data Loss Prevention', 'Detects and blocks personal data leaving through email, web and endpoints.', 't_infosec', 2, ['GET /dlp/incidents'], ['ds_audit'], []],
    ],
    stores: [['ds_consent', 'Consent Registry', 'Consent records with purpose, timestamp and channel.', 'Global', 't_dpo', 2]],
    controls: [
      ['ctl_pr01', 'PR-01', 'Consent recorded with purpose and timestamp', 'Each consent is stored with purpose, time and channel before processing.', ['prc_consent', 'sys_consent']],
      ['ctl_pr02', 'PR-02', 'Data subject requests answered within deadline', 'Access, correction and erasure requests are completed within the legal deadline.', ['prc_dsr', 'sys_dsr']],
      ['ctl_pr03', 'PR-03', 'Breach notification to regulator and individuals', 'Notifiable breaches are reported to the regulator and affected people on time.', ['prc_breach']],
      ['ctl_pr04', 'PR-04', 'Retention schedule enforcement', 'Data is deleted when its retention period ends unless a legal hold applies.', ['prc_dispose', 'ds_lake_raw']],
      ['ctl_pr05', 'PR-05', 'Cross-border transfer safeguards', 'Personal data sent abroad is protected by contracts and assessments.', ['prc_xfer']],
      ['ctl_pr06', 'PR-06', 'Data minimisation in analytics', 'Only necessary personal data is copied to the data platform.', ['sys_lake']],
      ['ctl_pr07', 'PR-07', 'DLP on outbound channels', 'Outbound email and uploads are scanned for personal data.', ['sys_dlp']],
    ],
  },
  {
    topic: 'cyber', team: 't_infosec',
    policies: [
      ['pol_infosec', 'Information Security Policy', 'Overall security governance, monitoring, encryption and secure configuration.'],
      ['pol_crypto', 'Cryptography Standard', 'Encryption algorithms, key lengths and key rotation for data at rest and in transit.'],
      ['pol_incident', 'Cyber Incident Management Policy', 'Detection, response and regulatory reporting of cyber incidents.'],
      ['pol_vuln', 'Vulnerability & Patch Management Standard', 'Vulnerability scanning, patch timelines and penetration testing.'],
    ],
    processes: [
      ['prc_vuln', 'Vulnerability management', 'Systems are scanned and vulnerabilities tracked to closure.', 'Global', 't_infosec', ['sys_vscan', 'sys_cmdb'], 'pol_vuln'],
      ['prc_patch', 'Patch management', 'Security patches are tested and applied within risk-based timelines.', 'Global', 't_cloud', ['sys_vscan', 'sys_cmdb', 'sys_itsm'], 'pol_vuln'],
      ['prc_pentest', 'Penetration testing', 'Internet-facing systems are penetration tested and findings fixed.', 'Global', 't_infosec', ['sys_mobile', 'sys_ib', 'sys_apigw'], 'pol_vuln'],
      ['prc_incident', 'Cyber incident response & reporting', 'Incidents are triaged, contained and reported to regulators within deadlines.', 'Global', 't_infosec', ['sys_siem', 'sys_itsm'], 'pol_incident'],
      ['prc_keymgmt', 'Key & certificate management', 'Encryption keys and certificates are generated, rotated and retired.', 'Global', 't_infosec', ['sys_kms'], 'pol_crypto'],
      ['prc_logmon', 'Security log monitoring', 'Security events are collected and monitored around the clock.', 'Global', 't_infosec', ['sys_siem'], 'pol_infosec'],
    ],
    systems: [
      ['sys_siem', 'SIEM & SOC Platform', 'Collects logs and runs detection use cases for the security operations centre.', 't_infosec', 3, ['POST /siem/events', 'GET /siem/incidents'], ['ds_audit'], []],
      ['sys_vscan', 'Vulnerability Scanner', 'Scans infrastructure and applications for vulnerabilities.', 't_infosec', 2, ['POST /scans', 'GET /scans/{id}/findings'], ['ds_cmdb'], []],
      ['sys_kms', 'Key Management Service', 'HSM-backed key generation, storage and rotation.', 't_infosec', 3, ['POST /kms/keys/{id}/rotate'], [], []],
      ['sys_itsm', 'IT Service Management', 'Incident, problem and change tickets.', 't_cloud', 2, ['POST /itsm/incidents', 'POST /itsm/changes'], ['ds_cmdb'], []],
      ['sys_cmdb', 'Configuration Management DB', 'Inventory of systems, owners and dependencies.', 't_cloud', 2, ['GET /cmdb/items/{id}'], ['ds_cmdb'], []],
      ['sys_waf', 'Web Application Firewall', 'Protects internet-facing apps and APIs from attacks.', 't_infosec', 3, [], [], []],
    ],
    stores: [
      ['ds_audit', 'Security Audit Log Store', 'Tamper-evident security and access logs.', 'Global', 't_infosec', 2],
      ['ds_cmdb', 'Asset Inventory', 'Hardware, software and configuration items.', 'Global', 't_cloud', 1],
    ],
    controls: [
      ['ctl_cy01', 'CY-01', 'Critical patches within defined timeline', 'Critical security patches are applied within the timeline set by risk.', ['prc_patch']],
      ['ctl_cy02', 'CY-02', 'Annual penetration test of internet-facing systems', 'Internet-facing systems are penetration tested at least annually.', ['prc_pentest', 'sys_apigw']],
      ['ctl_cy03', 'CY-03', 'Encryption of data at rest and in transit', 'Sensitive data is encrypted at rest and in transit with managed keys.', ['sys_kms', 'ds_cred', 'ds_custSG', 'ds_custIN']],
      ['ctl_cy04', 'CY-04', 'Cyber incidents reported to regulators within deadline', 'Reportable incidents are notified to MAS, RBI and CERT-In within their deadlines.', ['prc_incident']],
      ['ctl_cy05', 'CY-05', '24x7 security monitoring', 'The SOC monitors security events around the clock.', ['prc_logmon', 'sys_siem']],
      ['ctl_cy06', 'CY-06', 'WAF protection for public APIs', 'All public APIs sit behind the web application firewall.', ['sys_waf', 'sys_apigw']],
      ['ctl_cy07', 'CY-07', 'Encryption key rotation', 'Keys are rotated on a fixed schedule.', ['prc_keymgmt']],
    ],
  },
  {
    topic: 'outsourcing', team: 't_tprm',
    policies: [
      ['pol_tprm', 'Third-Party & Outsourcing Risk Policy', 'Due diligence, contracts, monitoring, sub-contracting and exit for outsourced and third-party services.'],
      ['pol_cloud', 'Cloud Adoption Standard', 'Security and resilience requirements for workloads in public cloud.'],
    ],
    processes: [
      ['prc_vendonb', 'Vendor due diligence & onboarding', 'New service providers are assessed and contracted with audit rights.', 'Global', 't_tprm', ['sys_vrm'], 'pol_tprm'],
      ['prc_vendmon', 'Ongoing vendor monitoring', 'Service providers are monitored for performance, incidents and risk.', 'Global', 't_tprm', ['sys_vrm'], 'pol_tprm'],
      ['prc_cloudchg', 'Cloud change management', 'Changes to cloud infrastructure follow approval and baseline checks.', 'Global', 't_cloud', ['sys_cloud', 'sys_itsm'], 'pol_cloud'],
      ['prc_exit', 'Outsourcing exit planning', 'Exit plans for material outsourcing are documented and tested.', 'Global', 't_tprm', ['sys_vrm'], 'pol_tprm'],
      ['prc_subcon', 'Sub-contractor oversight', 'Fourth parties used by service providers are identified and overseen.', 'Global', 't_tprm', ['sys_vrm'], 'pol_tprm'],
    ],
    systems: [
      ['sys_vrm', 'Vendor Risk Portal', 'Register and risk assessments of third-party service providers.', 't_tprm', 2, ['POST /vendors', 'POST /vendors/{id}/assessments'], ['ds_vendor', 'ds_contracts'], []],
      ['sys_cloud', 'Cloud Landing Zone', 'Accounts, networks and guardrails for cloud workloads.', 't_cloud', 3, ['POST /cloud/accounts', 'GET /cloud/compliance'], [], ['sys_siem']],
    ],
    stores: [
      ['ds_vendor', 'Vendor Register', 'Service providers, criticality and sub-contractors.', 'Global', 't_tprm', 2],
      ['ds_contracts', 'Contract Repository', 'Outsourcing agreements and their key clauses.', 'Global', 't_tprm', 1],
    ],
    controls: [
      ['ctl_os01', 'OS-01', 'Due diligence before material outsourcing', 'Material outsourcing needs completed due diligence and approval.', ['prc_vendonb']],
      ['ctl_os02', 'OS-02', 'Annual vendor risk reassessment', 'Critical vendors are reassessed every year.', ['prc_vendmon', 'sys_vrm']],
      ['ctl_os03', 'OS-03', 'Audit and access rights in contracts', 'Contracts give the bank and regulators audit and access rights.', ['prc_vendonb', 'ds_contracts']],
      ['ctl_os04', 'OS-04', 'Documented and tested exit plans', 'Exit plans exist for material outsourcing and are tested.', ['prc_exit']],
      ['ctl_os05', 'OS-05', 'Cloud configuration baseline monitoring', 'Cloud resources are checked continuously against the security baseline.', ['sys_cloud', 'prc_cloudchg']],
      ['ctl_os06', 'OS-06', 'Regulator notified of material outsourcing', 'Material outsourcing arrangements are notified to the regulator.', ['prc_vendonb']],
    ],
  },
  {
    topic: 'resilience', team: 't_resil',
    policies: [['pol_bcp', 'Business Continuity & Resilience Policy', 'Recovery objectives, disaster recovery testing, backups and outage management for critical services.']],
    processes: [
      ['prc_dr', 'Disaster recovery drill', 'Critical systems fail over to the DR site and recovery time is measured.', 'Global', 't_resil', ['sys_dr', 'sys_core', 'sys_pgw'], 'pol_bcp'],
      ['prc_backup', 'Backup & restore', 'Critical data is backed up and restores are tested.', 'Global', 't_resil', ['sys_backup'], 'pol_bcp'],
      ['prc_capacity', 'Capacity & availability management', 'Availability of critical services is monitored and capacity planned.', 'Global', 't_resil', ['sys_apm'], 'pol_bcp'],
      ['prc_majorinc', 'Major IT outage management', 'Major outages are managed, communicated and reported.', 'Global', 't_resil', ['sys_itsm', 'sys_notify'], 'pol_bcp'],
    ],
    systems: [
      ['sys_dr', 'DR Orchestrator', 'Automates failover and failback between primary and DR sites.', 't_resil', 3, ['POST /dr/failover'], [], ['sys_cloud']],
      ['sys_backup', 'Backup Service', 'Schedules and stores backups of critical systems.', 't_resil', 3, ['POST /backups/jobs', 'POST /backups/{id}/restore'], ['ds_backup'], []],
      ['sys_apm', 'Application Performance Monitoring', 'Tracks availability and latency of services.', 't_resil', 2, ['GET /apm/availability'], [], []],
    ],
    stores: [['ds_backup', 'Backup Vault', 'Backups of databases and configurations.', 'Global', 't_resil', 3]],
    controls: [
      ['ctl_rs01', 'RS-01', 'Recovery time objective for critical systems', 'Critical systems and business services, including cloud-hosted ones, recover within the approved recovery time objective.', ['prc_dr', 'sys_core', 'sys_pgw']],
      ['ctl_rs02', 'RS-02', 'Semi-annual DR testing', 'DR failover is tested twice a year.', ['prc_dr']],
      ['ctl_rs03', 'RS-03', 'Immutable backups', 'Backups of critical data cannot be altered or deleted.', ['prc_backup', 'ds_backup']],
      ['ctl_rs04', 'RS-04', 'Availability monitoring of payment services', 'Payment services availability is monitored with alerts.', ['prc_capacity', 'sys_apm', 'sys_pgw']],
      ['ctl_rs05', 'RS-05', 'Outages reported to regulators', 'Major outages of critical systems are reported to regulators.', ['prc_majorinc']],
    ],
  },
  {
    topic: 'reporting', team: 't_regrep',
    policies: [['pol_regrep', 'Regulatory Reporting Policy', 'Preparation, review and submission of regulatory returns and fraud reports to MAS and RBI.']],
    processes: [
      ['prc_returns', 'Regulatory return filing', 'Periodic returns are prepared, reviewed and submitted to MAS and RBI.', 'Global', 't_regrep', ['sys_regrep', 'sys_lake'], 'pol_regrep'],
      ['prc_fraudrep', 'Fraud & incident reporting to regulators', 'Fraud incidents and statistics are reported to regulators within prescribed timelines.', 'Global', 't_regrep', ['sys_regrep', 'sys_case'], 'pol_regrep'],
    ],
    systems: [['sys_regrep', 'Regulatory Reporting Engine', 'Generates regulatory returns from curated data.', 't_regrep', 2, ['POST /returns/generate'], ['ds_mart'], ['sys_lake']]],
    stores: [['ds_mart', 'Regulatory Returns Mart', 'Data prepared for regulatory returns.', 'Global', 't_regrep', 2]],
    controls: [
      ['ctl_rr01', 'RR-01', 'Four-eyes review of regulatory returns', 'Every return is reviewed by a second person before submission.', ['prc_returns']],
      ['ctl_rr02', 'RR-02', 'Fraud reported within prescribed timeline', 'Frauds are reported to the regulator within the required timeline.', ['prc_fraudrep']],
    ],
  },
  {
    topic: 'cards', team: 't_cards',
    policies: [['pol_cards', 'Card Security Standard', 'Card issuance, tokenisation, usage controls and card data protection.']],
    processes: [
      ['prc_cardiss', 'Card issuance & activation', 'Debit and credit cards are issued and activated.', 'Global', 't_cards', ['sys_cms'], 'pol_cards'],
      ['prc_token', 'Card tokenisation', 'Card numbers are replaced by tokens for wallets and merchants.', 'Global', 't_cards', ['sys_tokvault', 'sys_cms'], 'pol_cards'],
      ['prc_cardctl', 'Card usage controls', 'Customers switch international, online and contactless use on or off and set limits.', 'Global', 't_cards', ['sys_cms', 'sys_mobile'], 'pol_cards'],
    ],
    systems: [
      ['sys_cms', 'Card Management System', 'Card lifecycle, limits and usage controls.', 't_cards', 3, ['POST /cards', 'PUT /cards/{id}/controls'], ['ds_cardvault'], []],
      ['sys_tokvault', 'Tokenisation Vault', 'Issues and maps card tokens.', 't_cards', 3, ['POST /tokens'], ['ds_cardvault'], []],
    ],
    stores: [['ds_cardvault', 'Card Data Vault', 'Encrypted card numbers and token mappings.', 'Global', 't_cards', 3]],
    controls: [
      ['ctl_cd01', 'CD-01', 'Card-on-file tokenisation', 'Merchants and wallets store tokens, never card numbers.', ['prc_token', 'sys_tokvault']],
      ['ctl_cd02', 'CD-02', 'Customer-controlled card usage settings', 'Customers can enable or disable international and online usage.', ['prc_cardctl', 'sys_cms']],
      ['ctl_cd03', 'CD-03', 'Card data encryption', 'Card data is encrypted and access is restricted.', ['ds_cardvault']],
    ],
  },
  {
    topic: 'lending', team: 't_lend',
    policies: [['pol_lend', 'Digital Lending Policy', 'Digital loan origination, disclosures, disbursal and fair collection practices.']],
    processes: [
      ['prc_loanorig', 'Digital loan origination', 'Customers apply for personal loans in the app and get decisions.', 'IN', 't_lend', ['sys_los', 'sys_mobile', 'sys_c360'], 'pol_lend'],
      ['prc_kfs', 'Key fact statement disclosure', 'Borrowers receive a key fact statement with total cost before signing.', 'IN', 't_lend', ['sys_los'], 'pol_lend'],
      ['prc_collections', 'Collections & recovery', 'Overdue loans are followed up under fair practice rules.', 'IN', 't_lend', ['sys_coll'], 'pol_lend'],
    ],
    systems: [
      ['sys_los', 'Loan Origination System', 'Digital loan applications, credit decisions and documentation.', 't_lend', 2, ['POST /loans/applications', 'POST /loans/{id}/disburse'], ['ds_loans'], ['sys_core']],
      ['sys_coll', 'Collections Platform', 'Collection queues, calls and recovery tracking.', 't_lend', 1, ['POST /collections/contacts'], ['ds_loans'], []],
    ],
    stores: [['ds_loans', 'Loan Book DB', 'Loan accounts, schedules and repayments.', 'IN', 't_lend', 2]],
    controls: [
      ['ctl_ln01', 'LN-01', 'Key fact statement before loan contract', 'A key fact statement is provided before the loan contract is signed.', ['prc_kfs']],
      ['ctl_ln02', 'LN-02', "Disbursal only to borrower's own account", "Loans are disbursed directly into the borrower's bank account.", ['prc_loanorig', 'sys_los']],
      ['ctl_ln03', 'LN-03', 'Fair collection practices', 'Collection agents follow approved scripts and timings.', ['prc_collections']],
    ],
  },
  {
    topic: 'payments', team: 't_opsSG',
    policies: [['pol_complaints', 'Customer Complaints & Grievance Policy', 'Handling of customer complaints, unauthorised transaction claims, customer liability and escalation to the ombudsman.']],
    processes: [
      ['prc_cmp_sg', 'Complaint handling – Singapore', 'Customer complaints in Singapore are logged, investigated and resolved within service levels.', 'SG', 't_opsSG', ['sys_crm', 'sys_ivr'], 'pol_complaints'],
      ['prc_cmp_in', 'Grievance redressal – India', 'Customer grievances in India are resolved and escalated to the ombudsman if unresolved.', 'IN', 't_opsIN', ['sys_crm', 'sys_ivr'], 'pol_complaints'],
      ['prc_claims', 'Unauthorised transaction claims', 'Customers dispute unauthorised or scam transactions; liability is assessed and refunds made.', 'Global', 't_fraud', ['sys_crm', 'sys_case', 'sys_core'], 'pol_complaints'],
      ['prc_callverify', 'Contact-centre caller verification', 'Callers are verified before account changes are made over the phone.', 'Global', 't_digital', ['sys_ivr', 'sys_authsvc'], 'pol_complaints'],
    ],
    systems: [
      ['sys_crm', 'Customer Service CRM', 'Cases, complaints and interaction history for contact-centre and branch staff.', 't_digital', 2, ['POST /crm/complaints', 'GET /crm/customers/{id}/interactions'], ['ds_complaints'], ['sys_c360', 'sys_notify']],
      ['sys_ivr', 'Contact Centre IVR', 'Phone banking menus, caller authentication and call routing.', 't_digital', 2, ['POST /ivr/verify-caller'], [], ['sys_otp']],
    ],
    stores: [['ds_complaints', 'Complaints Register', 'Customer complaints, claims and resolution outcomes.', 'Global', 't_opsSG', 2]],
    controls: [
      ['ctl_cx01', 'CX-01', 'Complaints resolved within service level', 'Complaints are acknowledged and resolved within the published timelines.', ['prc_cmp_sg', 'prc_cmp_in']],
      ['ctl_cx02', 'CX-02', 'Unauthorised transaction liability assessment', 'Claims are assessed against the shared-responsibility and customer liability rules.', ['prc_claims']],
      ['ctl_cx03', 'CX-03', 'Caller verification before account changes', 'Phone requests to change contact details or limits need caller verification.', ['prc_callverify', 'sys_ivr']],
      ['ctl_cx04', 'CX-04', 'Ombudsman escalation tracking', 'Unresolved grievances are escalated and tracked to closure.', ['prc_cmp_in']],
    ],
  },
  {
    topic: 'kyc', team: 't_core',
    policies: [['pol_deposits', 'Deposit Accounts Policy', 'Account opening, dormant and inactive accounts, account closure and deposit interest.']],
    processes: [
      ['prc_dormant', 'Dormant account management', 'Inactive accounts are flagged dormant and reactivated only after re-verification.', 'Global', 't_core', ['sys_core', 'sys_c360'], 'pol_deposits'],
      ['prc_closure', 'Account closure', 'Customer accounts are closed and balances paid out.', 'Global', 't_core', ['sys_core', 'sys_crm'], 'pol_deposits'],
      ['prc_statement', 'Statements & customer records', 'Periodic statements are generated and delivered.', 'Global', 't_core', ['sys_stmt', 'sys_notify'], 'pol_deposits'],
    ],
    systems: [['sys_stmt', 'Statement Service', 'Generates and delivers account statements.', 't_core', 1, ['GET /statements/{account}'], ['ds_ledger'], []]],
    stores: [],
    controls: [
      ['ctl_dp01', 'DP-01', 'Re-verification before dormant account reactivation', 'Dormant accounts are reactivated only after identity re-verification.', ['prc_dormant']],
      ['ctl_dp02', 'DP-02', 'Account closure checks', 'Closures check for holds, pending claims and mule flags.', ['prc_closure']],
    ],
  },
];

// Library of obligations the bank already complies with (paraphrased summaries for the demo).
// [id, regulator, document, text, [controls], policy]
const OBLIGATIONS = [
  ['mas_trm_mfa', 'MAS', 'MAS Technology Risk Management Guidelines', 'Implement multi-factor authentication for customer login to online banking and for high-risk transactions such as adding payees or raising transfer limits.', ['ctl_ac01', 'ctl_ac02'], 'pol_auth_cust'],
  ['mas_trm_session', 'MAS', 'MAS Technology Risk Management Guidelines', 'Terminate online banking sessions automatically after a period of inactivity.', ['ctl_ac04'], 'pol_access'],
  ['mas_trm_priv', 'MAS', 'MAS Technology Risk Management Guidelines', 'Control and regularly review privileged access to critical systems.', ['ctl_ac05'], 'pol_access'],
  ['mas_trm_patch', 'MAS', 'MAS Technology Risk Management Guidelines', 'Apply security patches to systems within a timeframe that matches the risk of the vulnerability.', ['ctl_cy01'], 'pol_vuln'],
  ['mas_trm_pentest', 'MAS', 'MAS Technology Risk Management Guidelines', 'Conduct penetration testing of internet-facing systems at least annually.', ['ctl_cy02'], 'pol_vuln'],
  ['mas_trm_crypto', 'MAS', 'MAS Technology Risk Management Guidelines', 'Encrypt sensitive customer data at rest and in transit and manage cryptographic keys securely.', ['ctl_cy03', 'ctl_cy07'], 'pol_crypto'],
  ['mas_trm_soc', 'MAS', 'MAS Technology Risk Management Guidelines', 'Monitor security events continuously through a security operations capability.', ['ctl_cy05'], 'pol_infosec'],
  ['mas_trm_api', 'MAS', 'MAS Technology Risk Management Guidelines', 'Secure application programming interfaces exposed to third parties with strong authentication, encryption and attack protection.', ['ctl_cy06'], 'pol_infosec'],
  ['mas_n644_incident', 'MAS', 'MAS Notice on Technology Risk Management', 'Notify MAS of a relevant cyber or system incident within 1 hour of discovery.', ['ctl_cy04', 'ctl_rs05'], 'pol_incident'],
  ['mas_n644_rto', 'MAS', 'MAS Notice on Technology Risk Management', 'Recover each critical system within a recovery time objective of 4 hours.', ['ctl_rs01', 'ctl_rs02'], 'pol_bcp'],
  ['mas_n644_downtime', 'MAS', 'MAS Notice on Technology Risk Management', 'Keep unscheduled downtime of critical systems to no more than 4 hours in any 12-month period.', ['ctl_rs04'], 'pol_bcp'],
  ['mas_626_cdd', 'MAS', 'MAS Notice 626 (AML/CFT)', 'Identify and verify the identity of customers before establishing business relations.', ['ctl_ky01'], 'pol_cdd'],
  ['mas_626_bo', 'MAS', 'MAS Notice 626 (AML/CFT)', 'Identify and take reasonable measures to verify the beneficial owners of entity customers.', ['ctl_ky04'], 'pol_cdd'],
  ['mas_626_edd', 'MAS', 'MAS Notice 626 (AML/CFT)', 'Perform enhanced customer due diligence for higher-risk customers and politically exposed persons.', ['ctl_ky05'], 'pol_cdd'],
  ['mas_626_str', 'MAS', 'MAS Notice 626 (AML/CFT)', 'File suspicious transaction reports promptly with the Suspicious Transaction Reporting Office.', ['ctl_tm03'], 'pol_aml'],
  ['mas_626_records', 'MAS', 'MAS Notice 626 (AML/CFT)', 'Retain customer due diligence and transaction records for at least 5 years.', ['ctl_tm05'], 'pol_aml'],
  ['mas_626_screen', 'MAS', 'MAS Notice 626 (AML/CFT)', 'Screen customers and payments against sanctions lists and act on matches.', ['ctl_tm04'], 'pol_sanctions'],
  ['mas_scam_cooling', 'MAS', 'MAS–ABS anti-scam measures', 'Apply a cooling-off period of at least 12 hours when a new device is bound, during which high-risk activities are restricted.', ['ctl_ac03', 'ctl_py01'], 'pol_fraud'],
  ['mas_scam_alerts', 'MAS', 'MAS–ABS anti-scam measures', 'Send customers real-time notification alerts for outgoing transactions and changes to contact details.', ['ctl_py06', 'ctl_fr05'], 'pol_fraud'],
  ['mas_scam_killswitch', 'MAS', 'MAS–ABS anti-scam measures', 'Provide a self-service kill switch that lets customers suspend their accounts quickly.', ['ctl_fr02'], 'pol_fraud'],
  ['mas_scam_surveil', 'MAS', 'MAS–ABS anti-scam measures', 'Use real-time fraud surveillance to detect and block unauthorised or scam transactions.', ['ctl_fr01'], 'pol_fraud'],
  ['mas_pdpa_breach', 'MAS', 'PDPA (Singapore)', 'Notify the PDPC of a notifiable personal data breach within 3 days of assessing it.', ['ctl_pr03'], 'pol_privacy'],
  ['mas_pdpa_consent', 'MAS', 'PDPA (Singapore)', 'Obtain consent for the collection, use and disclosure of personal data for purposes notified to the individual.', ['ctl_pr01'], 'pol_privacy'],
  ['mas_pdpa_access', 'MAS', 'PDPA (Singapore)', 'Give individuals access to and correction of their personal data on request.', ['ctl_pr02'], 'pol_privacy'],
  ['mas_pdpa_transfer', 'MAS', 'PDPA (Singapore)', 'Ensure personal data transferred outside Singapore receives a comparable standard of protection.', ['ctl_pr05'], 'pol_privacy'],
  ['mas_outs_dd', 'MAS', 'MAS Guidelines on Outsourcing', 'Perform due diligence on service providers before entering a material outsourcing arrangement.', ['ctl_os01'], 'pol_tprm'],
  ['mas_outs_audit', 'MAS', 'MAS Guidelines on Outsourcing', 'Include audit and access rights for the institution and MAS in outsourcing agreements.', ['ctl_os03'], 'pol_tprm'],
  ['mas_outs_exit', 'MAS', 'MAS Guidelines on Outsourcing', 'Maintain exit and contingency plans for material outsourcing arrangements.', ['ctl_os04'], 'pol_tprm'],
  ['mas_outs_monitor', 'MAS', 'MAS Guidelines on Outsourcing', 'Monitor the performance and risk of service providers on an ongoing basis.', ['ctl_os02'], 'pol_tprm'],

  ['rbi_dpsc_mfa', 'RBI', 'RBI Master Direction on Digital Payment Security Controls', 'Implement multi-factor authentication for digital payment transactions using a dynamic factor.', ['ctl_ac02', 'ctl_ac01'], 'pol_auth_cust'],
  ['rbi_dpsc_device', 'RBI', 'RBI Master Direction on Digital Payment Security Controls', 'Bind mobile banking applications to the customer device and SIM.', ['ctl_ac03'], 'pol_auth_cust'],
  ['rbi_dpsc_limits', 'RBI', 'RBI Master Direction on Digital Payment Security Controls', 'Let customers set transaction limits and enable or disable payment channels themselves.', ['ctl_py02', 'ctl_cd02'], 'pol_paylimits'],
  ['rbi_dpsc_alerts', 'RBI', 'RBI Master Direction on Digital Payment Security Controls', 'Send customers alerts for debit transactions and for changes to registered contact details.', ['ctl_py06', 'ctl_fr05'], 'pol_xb'],
  ['rbi_itg_patch', 'RBI', 'RBI Master Direction on IT Governance, Risk, Controls and Assurance', 'Apply security patches within timelines based on the criticality of the vulnerability.', ['ctl_cy01'], 'pol_vuln'],
  ['rbi_itg_vapt', 'RBI', 'RBI Master Direction on IT Governance, Risk, Controls and Assurance', 'Carry out vulnerability assessment and penetration testing of critical and internet-facing systems periodically.', ['ctl_cy02'], 'pol_vuln'],
  ['rbi_itg_soc', 'RBI', 'RBI Master Direction on IT Governance, Risk, Controls and Assurance', 'Monitor critical systems through a security operations centre.', ['ctl_cy05'], 'pol_infosec'],
  ['rbi_itg_bcp', 'RBI', 'RBI Master Direction on IT Governance, Risk, Controls and Assurance', 'Maintain business continuity and disaster recovery arrangements and test them periodically.', ['ctl_rs01', 'ctl_rs02'], 'pol_bcp'],
  ['rbi_certin_6h', 'RBI', 'CERT-In Directions (2022)', 'Report cyber incidents to CERT-In within 6 hours of noticing them.', ['ctl_cy04'], 'pol_incident'],
  ['rbi_kyc_cdd', 'RBI', 'RBI Master Direction – KYC', 'Carry out customer due diligence and verify identity before opening an account.', ['ctl_ky01'], 'pol_cdd'],
  ['rbi_kyc_vcip', 'RBI', 'RBI Master Direction – KYC', 'Video-based customer identification must include liveness checks and geo-tagging of the customer.', ['ctl_ky02'], 'pol_cdd'],
  ['rbi_kyc_refresh', 'RBI', 'RBI Master Direction – KYC', 'Update KYC periodically based on the risk category of the customer.', ['ctl_ky03', 'ctl_ky06'], 'pol_cdd'],
  ['rbi_kyc_bo', 'RBI', 'RBI Master Direction – KYC', 'Identify the beneficial owners of legal entity customers.', ['ctl_ky04'], 'pol_cdd'],
  ['rbi_pmla_str', 'RBI', 'PMLA Rules', 'Furnish suspicious transaction reports to FIU-IND within 7 days of concluding that a transaction is suspicious.', ['ctl_tm03'], 'pol_aml'],
  ['rbi_pmla_records', 'RBI', 'PMLA Rules', 'Preserve records of transactions for at least 5 years.', ['ctl_tm05'], 'pol_aml'],
  ['rbi_storage', 'RBI', 'RBI Directive on Storage of Payment System Data', 'Store the entire payment system data only in systems located in India.', ['ctl_py04'], 'pol_xb'],
  ['rbi_dpdp_consent', 'RBI', 'DPDP Act 2023', 'Process personal data only with free, specific and informed consent or for a legitimate use.', ['ctl_pr01'], 'pol_privacy'],
  ['rbi_dpdp_breach', 'RBI', 'DPDP Act 2023', 'Inform the Data Protection Board and affected data principals of a personal data breach.', ['ctl_pr03'], 'pol_privacy'],
  ['rbi_dpdp_rights', 'RBI', 'DPDP Act 2023', 'Enable data principals to access, correct and erase their personal data.', ['ctl_pr02'], 'pol_privacy'],
  ['rbi_outs_dd', 'RBI', 'RBI Master Direction on Outsourcing of IT Services', 'Assess risks and perform due diligence before outsourcing IT services.', ['ctl_os01'], 'pol_tprm'],
  ['rbi_outs_audit', 'RBI', 'RBI Master Direction on Outsourcing of IT Services', "Ensure the bank and RBI have the right to audit and inspect service providers.", ['ctl_os03'], 'pol_tprm'],
  ['rbi_outs_exit', 'RBI', 'RBI Master Direction on Outsourcing of IT Services', 'Maintain an exit strategy for outsourced IT services.', ['ctl_os04'], 'pol_tprm'],
  ['rbi_lend_kfs', 'RBI', 'RBI Digital Lending Directions', 'Provide borrowers with a key fact statement before the loan contract is executed.', ['ctl_ln01'], 'pol_lend'],
  ['rbi_lend_disb', 'RBI', 'RBI Digital Lending Directions', "Disburse loans directly into the borrower's bank account.", ['ctl_ln02'], 'pol_lend'],
  ['rbi_fraud_report', 'RBI', 'RBI Master Directions on Fraud Risk Management', 'Report frauds to RBI within the prescribed timelines and maintain a fraud risk management framework.', ['ctl_rr02', 'ctl_fr06'], 'pol_regrep'],
];

export const SCALES = {
  core: { label: 'Core (~500 items)', ms: [0, 0] },
  large: { label: 'Large (~1,000 items)', ms: [4, 7] },
  enterprise: { label: 'Enterprise (~1,500 items)', ms: [10, 14] },
};
const MS_KINDS = ['orchestrator', 'validator', 'event consumer', 'batch job', 'cache', 'adapter', 'reporting feed', 'rules engine', 'notification worker', 'audit logger', 'config service', 'gateway plugin', 'scheduler', 'reconciler'];
const VERBS = ['GET', 'POST', 'PUT', 'PATCH'];

// opts: seed (randomises criticality, generated services and which links are undocumented),
// scale (core | large | enterprise), hidden (share of dependency links missing from the documented map).
export function buildBank(opts = {}) {
  if (typeof opts === 'number') opts = { seed: opts };
  const { seed = 2026, scale = 'core', hidden = 0.1 } = opts;
  const rng = new RNG(seed);
  const nodes = new Map();
  const edges = [];
  const edgeKeys = new Set();
  const add = (n) => { nodes.set(n.id, n); return n; };
  const link = (s, t, type) => {
    if (!nodes.has(s) || !nodes.has(t) || s === t) return;
    const k = `${s}>${t}`;
    if (edgeKeys.has(k)) return;
    edgeKeys.add(k);
    edges.push({ s, t, type, w: EDGE_W[type], hidden: false });
  };

  for (const [id, name] of TEAMS) add({ id, type: 'team', name, desc: `${name} team.`, topic: 'shared', region: 'Global', crit: 2 });

  const pending = []; // [systemId, apis, stores, calls]
  const sysNode = (s, topic) => {
    const [id, name, desc, owner, crit, apis, stores, calls] = s;
    add({ id, type: 'system', name, desc, topic, owner, crit, region: 'Global' });
    pending.push([id, apis, stores, calls, owner, crit, topic]);
  };
  for (const s of SHARED_SYSTEMS) sysNode(s, 'shared');
  for (const [id, name, desc, region, owner, crit] of SHARED_STORES) add({ id, type: 'datastore', name, desc, region, owner, crit, topic: 'shared' });

  const controlTargets = [];
  const procSystems = [];
  for (const p of PACKS) {
    for (const [id, name, desc] of p.policies) add({ id, type: 'policy', name, desc, topic: p.topic, owner: p.team, crit: 3, region: 'Global' });
    for (const s of p.systems) sysNode(s, p.topic);
    for (const [id, name, desc, region, owner, crit] of p.stores) add({ id, type: 'datastore', name, desc, region, owner, crit, topic: p.topic });
    for (const [id, name, desc, region, owner, systems, pol] of p.processes) {
      add({ id, type: 'process', name, desc, region, owner, topic: p.topic, crit: 2 + (rng.chance(0.4) ? 1 : 0) });
      procSystems.push([id, systems, pol]);
    }
    for (const [id, code, name, desc, targets] of p.controls) {
      add({ id, type: 'control', code, name, desc, topic: p.topic, owner: p.team, crit: 2 + (rng.chance(0.5) ? 1 : 0), region: 'Global' });
      controlTargets.push([id, targets]);
    }
  }

  // APIs, data stores and calls
  for (const [sid, apis, stores, calls, owner, crit, topic] of pending) {
    apis.forEach((a, i) => {
      const id = `api_${sid.slice(4)}_${i}`;
      const sys = nodes.get(sid);
      add({ id, type: 'api', name: a, desc: `${a} endpoint of ${sys.name}. ${sys.desc}`, owner, crit, topic, region: 'Global', parent: sid });
      link(sid, id, 'exposes');
    });
    for (const d of stores) link(sid, d, 'stores');
    for (const c of calls) link(sid, c, 'calls');
  }
  for (const [pid, systems, pol] of procSystems) {
    link(pol, pid, 'governs');
    for (const s of systems) link(pid, s, 'runs_on');
  }
  for (const [cid, targets] of controlTargets) {
    for (const t of targets) {
      const tt = nodes.get(t)?.type;
      link(t, cid, tt === 'process' ? 'controlled_by' : tt === 'datastore' ? 'protects' : 'monitored_by');
    }
  }

  // Generated microservices (Large / Enterprise): each core system is split into services that
  // inherit its data stores and monitoring controls, so impact has realistic depth and fan-out.
  const [m0, m1] = (SCALES[scale] || SCALES.core).ms;
  if (m1 > 0) {
    const sysList = [...nodes.values()].filter((n) => n.type === 'system');
    const out = (id, type) => edges.filter((e) => e.s === id && e.type === type).map((e) => e.t);
    for (const sys of sysList) {
      const k = rng.int(m0, m1) - (sys.topic === 'shared' ? 1 : 0);
      const stores = out(sys.id, 'stores');
      const ctrls = out(sys.id, 'monitored_by');
      const kinds = [...MS_KINDS].sort(() => rng.next() - 0.5);
      for (let j = 0; j < k; j++) {
        const kind = kinds[j % kinds.length];
        const id = `${sys.id}__${kind.replace(/\s+/g, '-')}`;
        if (nodes.has(id)) continue;
        add({ id, type: 'system', name: `${sys.name} · ${kind}`, desc: `${kind[0].toUpperCase() + kind.slice(1)} microservice of ${sys.name}. ${sys.desc}`, topic: sys.topic, owner: sys.owner, crit: Math.max(1, sys.crit - rng.int(0, 1)), region: sys.region, parent: sys.id, generated: true });
        link(sys.id, id, 'calls');
        if (stores.length && rng.chance(0.7)) link(id, rng.pick(stores), 'stores');
        for (const c of ctrls) if (rng.chance(0.5)) link(id, c, 'monitored_by');
        if (rng.chance(0.6)) {
          const slug = sys.name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
          const aid = `api_${id}`;
          add({ id: aid, type: 'api', name: `${rng.pick(VERBS)} /${slug}/${kind.replace(/\s+/g, '-')}`, desc: `Endpoint of ${sys.name} ${kind}. ${sys.desc}`, owner: sys.owner, crit: sys.crit, topic: sys.topic, region: 'Global', parent: id, generated: true });
          link(id, aid, 'exposes');
        }
      }
    }
  }

  // Audit evidence for every control
  let ei = 0;
  for (const n of [...nodes.values()].filter((x) => x.type === 'control')) {
    const e1 = add({ id: `ev_${n.code}_t`, type: 'evidence', name: `${n.code} control test report`, desc: `Periodic test showing that "${n.name}" operates effectively.`, owner: n.owner, topic: n.topic, crit: 1, region: 'Global' });
    link(n.id, e1.id, 'evidenced_by');
    if (ei++ % 2 === 0) {
      const e2 = add({ id: `ev_${n.code}_c`, type: 'evidence', name: `${n.code} configuration snapshot`, desc: `System configuration export evidencing "${n.name}".`, owner: n.owner, topic: n.topic, crit: 1, region: 'Global' });
      link(n.id, e2.id, 'evidenced_by');
    }
  }

  // Ownership
  for (const n of nodes.values()) if (n.owner && ['policy', 'process', 'system', 'control', 'datastore'].includes(n.type)) link(n.id, n.owner, 'owned_by');

  // Library obligations
  for (const [id, regulator, doc, text, controls, policy] of OBLIGATIONS) {
    add({ id, type: 'regulation', kind: 'obligation', regulator, doc, name: `${regulator} · ${doc}`, desc: text, topic: 'shared', crit: 3, region: regulator === 'MAS' ? 'SG' : 'IN' });
    for (const c of controls) link(id, c, 'satisfied_by');
    link(id, policy, 'implemented_in');
  }

  // Topics from text
  for (const n of nodes.values()) {
    const t = topicsOf(tokenize(`${n.name} ${n.desc}`));
    n.topics = [...new Set([...(n.topic && n.topic !== 'shared' ? [n.topic] : []), ...t])];
    if (n.topic === 'shared') n.topic = n.type === 'regulation' ? (t[0] || 'reporting') : 'shared';
  }

  // Hold out ~10% of dependency edges: the bank's "documented" map is never complete.
  // RegTrace sees only the observed graph; ground truth uses the full graph.
  for (const e of edges) {
    if (['runs_on', 'stores', 'monitored_by', 'calls'].includes(e.type) && rng.chance(hidden)) e.hidden = true;
  }
  return { nodes, edges, list: [...nodes.values()], meta: { source: 'synthetic', seed, scale, hidden } };
}

// ------------------------------------------------------------------ import / export
// A bank map is plain JSON: { nodes: [{id, type, name, desc, owner?, region?, code?, regulator?, doc?}],
//                            edges: [{s, t, type, undocumented?}] }
export function exportBank(bank) {
  const keep = ['id', 'type', 'name', 'desc', 'owner', 'region', 'code', 'regulator', 'doc', 'crit', 'topic'];
  return {
    format: 'regtrace-bank/1',
    meta: bank.meta,
    nodes: bank.list.map((n) => Object.fromEntries(keep.filter((k) => n[k] !== undefined).map((k) => [k, n[k]]))),
    edges: bank.edges.map((e) => ({ s: e.s, t: e.t, type: e.type, ...(e.hidden ? { undocumented: true } : {}) })),
  };
}

export function importBank(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) throw new Error('Expected { nodes: [...], edges: [...] }');
  const nodes = new Map();
  const problems = [];
  for (const raw of data.nodes) {
    if (!raw.id || !LAYERS.includes(raw.type)) { problems.push(`node ${raw.id || '?'}: unknown type "${raw.type}"`); continue; }
    const n = { region: 'Global', crit: 2, ...raw, name: raw.name || raw.id, desc: raw.desc || raw.name || raw.id };
    if (n.type === 'regulation') {
      n.regulator = /^mas$/i.test(n.regulator) ? 'MAS' : 'RBI';
      n.kind = 'obligation';
      n.doc = n.doc || `${n.regulator} obligation`;
    }
    nodes.set(n.id, n);
  }
  const edges = [];
  const seen = new Set();
  for (const e of data.edges) {
    if (!nodes.has(e.s) || !nodes.has(e.t)) { problems.push(`edge ${e.s} -> ${e.t}: unknown node`); continue; }
    if (!EDGE_W[e.type]) { problems.push(`edge ${e.s} -> ${e.t}: unknown type "${e.type}"`); continue; }
    if (seen.has(`${e.s}>${e.t}`)) continue;
    seen.add(`${e.s}>${e.t}`);
    edges.push({ s: e.s, t: e.t, type: e.type, w: EDGE_W[e.type], hidden: !!e.undocumented });
  }
  for (const n of nodes.values()) {
    const t = topicsOf(tokenize(`${n.name} ${n.desc}`));
    if (!n.topic || !TOPIC_KEYS.includes(n.topic)) n.topic = n.type === 'team' ? 'shared' : t[0] || 'shared';
    n.topics = [...new Set([...(n.topic !== 'shared' ? [n.topic] : []), ...t])];
    if (n.type === 'regulation' && n.topic === 'shared') n.topic = 'reporting';
  }
  if (!nodes.size) throw new Error('No valid nodes found');
  return { nodes, edges, list: [...nodes.values()], meta: { source: 'imported', name: data.meta?.name || 'Imported bank', problems } };
}
