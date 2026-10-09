// Demo circulars. These are SYNTHETIC documents written for the RegTrace MVP. They are modelled on the
// style of MAS / RBI circulars but were not issued by either regulator.
// `anchors` = expert labels: the bank items each clause directly affects (used only for the benchmark).

function doc(meta, clauses) {
  const head = [
    meta.header,
    meta.ref,
    `Date: ${meta.date}`,
    '',
    meta.title,
    '',
    meta.intro,
    '',
  ];
  const body = clauses.map((c, i) => `${i + 1}. ${c.text}`);
  const tail = ['', meta.closing, '', 'DEMO DOCUMENT – synthetic circular created for the RegTrace prototype. Not issued by any regulator.'];
  return { ...meta, text: [...head, ...body, ...tail].join('\n'), clauses };
}

const RBI_XB_V1 = [
  { text: 'Regulated entities shall authenticate every cross-border outward remittance initiated through digital channels using at least two factors, one of which shall be dynamically generated or biometric.', anchors: ['ctl_ac02', 'pol_auth_cust', 'prc_stepup', 'prc_outrem'] },
  { text: 'A cooling-off period of not less than 12 hours shall apply before a newly added beneficiary can receive a cross-border transfer, and customers shall be notified when a beneficiary is added.', anchors: ['ctl_py01', 'prc_payee', 'sys_payee', 'ctl_fr05'] },
  { text: 'Regulated entities shall verify the beneficiary name with the receiving institution and display it to the customer before a UPI–PayNow linked transfer is confirmed.', anchors: ['ctl_py03', 'prc_upipaynow', 'sys_paynow', 'sys_upi'] },
  { text: 'Every outward cross-border transaction shall be screened in real time against sanctions lists and scored for fraud risk before funds are released.', anchors: ['ctl_tm04', 'ctl_fr01', 'prc_rtfraud', 'prc_screen', 'sys_screen', 'sys_fraud'] },
  { text: 'Customers shall be able to set a daily limit for cross-border transfers and to disable cross-border payments entirely through the mobile banking application.', anchors: ['ctl_py02', 'prc_limits', 'sys_limits'] },
  { text: 'Payment system data relating to cross-border transactions shall be stored only in systems located in India; where the foreign leg is processed abroad, the copy shall be deleted within 1 business day.', anchors: ['ctl_py04', 'ds_payIN', 'sys_xbhub'] },
  { text: 'Suspected fraudulent cross-border transactions shall be notified to the customer within 1 hour and reported to the Reserve Bank in the fraud returns.', anchors: ['ctl_rr02', 'prc_fraudrep', 'prc_fraudcase', 'ctl_py06'] },
  { text: 'The board-approved Cross-Border Payments Policy shall be updated to reflect these requirements before the effective date.', anchors: ['pol_xb'] },
];
const RBI_XB_V2 = [
  RBI_XB_V1[0],
  { text: 'A cooling-off period of not less than 24 hours shall apply before a newly added beneficiary can receive a cross-border transfer, and customers shall be notified when a beneficiary is added.', anchors: RBI_XB_V1[1].anchors },
  RBI_XB_V1[2],
  RBI_XB_V1[3],
  { text: 'Customers shall be able to set a daily limit for cross-border transfers and to disable cross-border payments entirely through the mobile banking application; a default limit of ₹1,00,000 per day shall apply for the first 30 days after account opening.', anchors: ['ctl_py02', 'prc_limits', 'sys_limits', 'prc_onb_in'] },
  RBI_XB_V1[5],
  { text: 'Suspected fraudulent cross-border transactions shall be notified to the customer within 30 minutes and reported to the Reserve Bank in the fraud returns.', anchors: RBI_XB_V1[6].anchors },
  RBI_XB_V1[7],
  { text: 'Regulated entities shall provide customers with a kill switch to immediately block all cross-border payments and digital channel access on suspicion of fraud.', anchors: ['ctl_fr02', 'prc_killswitch', 'sys_ks'] },
];

export const CIRCULARS = [
  doc({
    id: 'rbi-xb-v1', regulator: 'RBI', version: 1, family: 'rbi-xb',
    header: 'RESERVE BANK OF INDIA (DEMO)', ref: 'RBI/DEMO/2026-27/14 · DPSS.DEMO.No.S-112', date: '10 October 2026',
    title: 'Strengthening Authentication and Fraud Safeguards for Cross-Border Digital Payments',
    intro: 'With the growth of cross-border digital payments, including the UPI–PayNow linkage, regulated entities are advised to implement the following measures. These directions shall come into effect from 1 April 2027.',
    closing: 'Regulated entities shall comply with these directions with effect from 1 April 2027.',
    short: 'RBI · Cross-border payment safeguards (v1)',
  }, RBI_XB_V1),
  doc({
    id: 'rbi-xb-v2', regulator: 'RBI', version: 2, family: 'rbi-xb',
    header: 'RESERVE BANK OF INDIA (DEMO)', ref: 'RBI/DEMO/2026-27/14 (Amended) · DPSS.DEMO.No.S-112A', date: '2 December 2026',
    title: 'Strengthening Authentication and Fraud Safeguards for Cross-Border Digital Payments – Amendment',
    intro: 'Based on feedback received, the directions dated 10 October 2026 are amended as below. These directions shall come into effect from 1 April 2027.',
    closing: 'Regulated entities shall comply with these directions with effect from 1 April 2027.',
    short: 'RBI · Cross-border payment safeguards (v2, amended)',
  }, RBI_XB_V2),
  doc({
    id: 'mas-scam', regulator: 'MAS', version: 1, family: 'mas-scam',
    header: 'MONETARY AUTHORITY OF SINGAPORE (DEMO)', ref: 'MAS/DEMO/2026/07', date: '15 October 2026',
    title: 'Enhanced Anti-Scam Measures for Cross-Border Transfers',
    intro: 'Scammers increasingly move proceeds across borders within minutes. Financial institutions shall implement the measures below, which take effect from 1 July 2027.',
    closing: 'These measures take effect from 1 July 2027. Financial institutions should engage MAS early on implementation challenges.',
    short: 'MAS · Anti-scam measures for cross-border transfers',
  }, [
    { text: 'Financial institutions shall impose a cooling-off period of at least 12 hours after a new device is bound to a customer account, during which cross-border transfers above S$1,000 are blocked.', anchors: ['ctl_ac03', 'prc_device', 'sys_devbind', 'ctl_py02'] },
    { text: 'Real-time notifications shall be sent to customers for every outgoing cross-border transfer, showing the payee name and amount.', anchors: ['ctl_py06', 'prc_paystatus', 'sys_notify'] },
    { text: 'Financial institutions shall provide a kill switch that allows customers to suspend all digital channel access and cross-border payments.', anchors: ['ctl_fr02', 'prc_killswitch', 'sys_ks'] },
    { text: 'Financial institutions shall detect and block payments to accounts identified as money mules, and share mule indicators with other institutions through approved channels.', anchors: ['ctl_tm06', 'ctl_fr04', 'sys_tm', 'prc_freeze'] },
    { text: 'Scam reports from customers shall be acknowledged within 24 hours and recovery efforts with the receiving institution started without delay.', anchors: ['ctl_fr03', 'prc_scamreport'] },
    { text: 'The fraud surveillance system shall assess cross-border transfers in real time using behavioural and device signals.', anchors: ['ctl_fr01', 'prc_rtfraud', 'sys_fraud', 'ds_fraud'] },
    { text: 'Institutions shall test the effectiveness of these anti-scam controls at least annually and report the results to the board.', anchors: ['pol_fraud', 'ctl_fr06'] },
  ]),
  doc({
    id: 'rbi-dpdp', regulator: 'RBI', version: 1, family: 'rbi-dpdp',
    header: 'RESERVE BANK OF INDIA (DEMO)', ref: 'RBI/DEMO/2026-27/21 · DoR.DEMO.No.P-07', date: '20 October 2026',
    title: 'Protection of Customer Personal Data in Regulated Entities',
    intro: 'In alignment with the Digital Personal Data Protection Act, 2023, regulated entities shall adopt the following practices. These directions shall come into effect from 13 May 2027.',
    closing: 'These directions shall come into effect from 13 May 2027.',
    short: 'RBI · Customer personal data protection',
  }, [
    { text: 'Regulated entities shall obtain verifiable consent before processing a customer\'s personal data for any purpose that is not necessary for providing the requested financial service.', anchors: ['ctl_pr01', 'prc_consent', 'sys_consent', 'ds_consent'] },
    { text: 'Customers shall be able to withdraw consent through the same channel used to give it, and processing based on that consent shall stop within 7 days.', anchors: ['prc_consent', 'sys_consent', 'ctl_pr01'] },
    { text: 'Requests from data principals to access, correct or erase their personal data shall be resolved within 30 days.', anchors: ['ctl_pr02', 'prc_dsr', 'sys_dsr'] },
    { text: 'A personal data breach shall be intimated to the Data Protection Board and to affected customers within 72 hours of becoming aware of it.', anchors: ['ctl_pr03', 'prc_breach'] },
    { text: 'Personal data shall be erased once the purpose is served, subject to retention required under other laws such as the PMLA.', anchors: ['ctl_pr04', 'prc_dispose', 'pol_retention', 'ds_lake_raw'] },
    { text: 'Personal data transferred outside India shall be protected by contractual safeguards and shall not be transferred to restricted jurisdictions.', anchors: ['ctl_pr05', 'prc_xfer'] },
    { text: 'Regulated entities shall appoint a Data Protection Officer based in India and publish the officer\'s contact details on their website.', anchors: ['pol_privacy'] },
  ]),
  doc({
    id: 'mas-tpr', regulator: 'MAS', version: 1, family: 'mas-tpr',
    header: 'MONETARY AUTHORITY OF SINGAPORE (DEMO)', ref: 'MAS/DEMO/2026/11', date: '1 November 2026',
    title: 'Operational Resilience of Third-Party and Cloud Services',
    intro: 'Financial institutions rely increasingly on third parties and cloud providers for critical business services. The following requirements take effect from 1 January 2028.',
    closing: 'These requirements take effect from 1 January 2028.',
    short: 'MAS · Third-party & cloud resilience',
  }, [
    { text: 'Financial institutions shall maintain a register of all third-party service providers supporting critical business services, including their sub-contractors.', anchors: ['prc_subcon', 'ds_vendor', 'sys_vrm', 'ctl_os02'] },
    { text: 'Critical business services shall be recoverable within 4 hours, including where they depend on cloud service providers.', anchors: ['ctl_rs01', 'prc_dr', 'sys_dr', 'sys_cloud'] },
    { text: 'Exit plans for material outsourcing arrangements shall be tested at least every 2 years.', anchors: ['ctl_os04', 'prc_exit'] },
    { text: 'Cloud configurations for critical systems shall be monitored continuously against an approved security baseline.', anchors: ['ctl_os05', 'prc_cloudchg', 'sys_cloud'] },
    { text: 'Service providers shall notify the institution of any incident affecting its data or services within 1 hour, so that the institution can meet its own incident reporting obligations.', anchors: ['ctl_cy04', 'prc_incident', 'prc_vendmon'] },
    { text: 'Backups of critical data shall be immutable and kept in a location independent of the primary cloud region.', anchors: ['ctl_rs03', 'prc_backup', 'ds_backup'] },
  ]),
];

export const getCircular = (id) => CIRCULARS.find((c) => c.id === id);
