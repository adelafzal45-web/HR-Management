/* Temporary live-probe run. Deleted after verification. */
const { ok, login, api, report } = require('./probe-appraisal.cjs');

const TYPES = ['rating', 'yes_no', 'multiple_choice', 'dropdown', 'text_feedback'];

(async () => {
  console.log('\n== LOGIN ==');
  const hrToken = await login('hr.admin@hrms.local');
  const leadToken = await login('team.lead@hrms.local');
  const empToken = await login('employee@hrms.local');
  const hr = api(hrToken);
  const lead = api(leadToken);
  const emp = api(empToken);
  ok('three logins returned tokens', !!hrToken && !!leadToken && !!empToken);

  // ---------------------------------------------------------------- bank: 5 types
  console.log('\n== QUESTION BANK: 5 TYPES ==');
  const bankIds = {};
  for (const t of TYPES) {
    const body = {
      questionText: `Probe ${t} ${Date.now()}`,
      questionType: t,
      ...(t === 'multiple_choice' || t === 'dropdown'
        ? {
            options: [
              { optionText: 'Low', score: 0 },
              { optionText: 'Mid', score: 5 },
              { optionText: 'High', score: 10 },
            ],
          }
        : {}),
    };
    const r = await hr('POST', '/appraisal/questions', body);
    ok(`create ${t}`, r.status === 201, `-> ${r.status} ${r.text?.slice(0, 160)}`);
    // POST returns BankQuestionMutationResult: {question, affectedDraftForms, ...}
    if (r.json) bankIds[t] = r.json.question?.questionId ?? r.json.questionId;
  }

  // yes_no should have auto-created exactly 2 scored options
  if (bankIds.yes_no) {
    const r = await hr('GET', `/appraisal/questions/${bankIds.yes_no}`);
    const opts = r.json?.options ?? [];
    ok('yes_no auto-created 2 scored options', opts.length === 2, `-> ${opts.length}`);
  }

  // per-type validation rejections
  const badRating = await hr('POST', '/appraisal/questions', {
    questionText: 'rating with options',
    questionType: 'rating',
    options: [{ optionText: 'a', score: 1 }, { optionText: 'b', score: 2 }],
  });
  ok('rating + options -> 400', badRating.status === 400, `-> ${badRating.status}`);

  const badMc = await hr('POST', '/appraisal/questions', {
    questionText: 'mc with one option',
    questionType: 'multiple_choice',
    options: [{ optionText: 'only', score: 1 }],
  });
  ok('multiple_choice with 1 option -> 400', badMc.status === 400, `-> ${badMc.status}`);

  // ---------------------------------------------------------------- form + weights
  console.log('\n== FORM WEIGHTS ==');
  const formRes = await hr('POST', '/appraisal/forms', {
    formName: `Probe Form ${Date.now()}`,
    description: 'live probe',
    evaluationType: 'Monthly',
  });
  ok('create form', formRes.status === 201, `-> ${formRes.status} ${formRes.text?.slice(0, 200)}`);
  const formId = formRes.json?.formId ?? formRes.json?.form_id;

  // weighted text_feedback must be rejected outright
  const weightedText = await hr('PUT', `/appraisal/forms/${formId}/questions`, {
    questions: [
      { bankQuestionId: bankIds.rating, weightage: 70, isActive: true, ratingScale: 10 },
      { bankQuestionId: bankIds.text_feedback, weightage: 30, isActive: true },
    ],
  });
  ok('weighted text_feedback -> 400', weightedText.status === 400,
    `-> ${weightedText.status} ${weightedText.text?.slice(0, 200)}`);

  // all five types, weights summing to 100 across the four scored ones
  const save = await hr('PUT', `/appraisal/forms/${formId}/questions`, {
    questions: [
      { bankQuestionId: bankIds.rating, weightage: 25, isActive: true, ratingScale: 10 },
      { bankQuestionId: bankIds.yes_no, weightage: 25, isActive: true },
      { bankQuestionId: bankIds.multiple_choice, weightage: 25, isActive: true },
      { bankQuestionId: bankIds.dropdown, weightage: 25, isActive: true },
      { bankQuestionId: bankIds.text_feedback, weightage: 0, isActive: true },
    ],
  });
  ok('save 5 typed questions (100% + unweighted text)', save.status === 200 || save.status === 201,
    `-> ${save.status} ${save.text?.slice(0, 300)}`);

  // weights != 100 -> publish must fail
  const badForm = await hr('POST', '/appraisal/forms', {
    formName: `Probe Bad Weights ${Date.now()}`, evaluationType: 'Monthly',
  });
  const badFormId = badForm.json?.formId ?? badForm.json?.form_id;
  await hr('PUT', `/appraisal/forms/${badFormId}/questions`, {
    questions: [{ bankQuestionId: bankIds.rating, weightage: 60, isActive: true, ratingScale: 10 }],
  });
  const badPub = await hr('POST', `/appraisal/forms/${badFormId}/publish`);
  ok('publish with weights != 100 -> 400', badPub.status === 400,
    `-> ${badPub.status} ${badPub.text?.slice(0, 200)}`);

  // ---------------------------------------------------------------- compare bounds
  console.log('\n== COMPARE BOUNDS ==');
  const emps = await hr('GET', '/appraisal/results?page=1&limit=10');
  ok('results endpoint paginates', emps.status === 200 && emps.json && 'total' in emps.json,
    `-> ${emps.status} ${emps.text?.slice(0, 200)}`);

  const one = await hr('GET', '/appraisal/compare?employeeIds=00000000-0000-0000-0000-000000000001');
  ok('compare with 1 id -> 400', one.status === 400, `-> ${one.status}`);
  const seven = Array.from({ length: 7 }, (_, i) =>
    `00000000-0000-0000-0000-00000000000${i + 1}`).join(',');
  const sevenRes = await hr('GET', `/appraisal/compare?employeeIds=${seven}`);
  ok('compare with 7 ids -> 400', sevenRes.status === 400, `-> ${sevenRes.status}`);

  // ---------------------------------------------------------------- RBAC
  console.log('\n== RBAC ==');
  const empStats = await emp('GET', '/appraisal/stats');
  ok('employee GET /appraisal/stats -> 403', empStats.status === 403, `-> ${empStats.status}`);
  const empCompare = await emp('GET', '/appraisal/compare?employeeIds=a,b');
  ok('employee GET /appraisal/compare -> 403', empCompare.status === 403, `-> ${empCompare.status}`);
  const empBank = await emp('GET', '/appraisal/questions');
  ok('employee GET /appraisal/questions -> 403', empBank.status === 403, `-> ${empBank.status}`);
  const empLeads = await emp('GET', '/appraisal/team-lead-assignments');
  ok('employee GET /team-lead-assignments -> 403', empLeads.status === 403, `-> ${empLeads.status}`);
  const leadBank = await lead('GET', '/appraisal/questions');
  ok('team lead GET /appraisal/questions -> 403', leadBank.status === 403, `-> ${leadBank.status}`);
  const leadStats = await lead('GET', '/appraisal/stats');
  ok('team lead GET /appraisal/stats -> 200 (roster-scoped)', leadStats.status === 200,
    `-> ${leadStats.status} ${leadStats.text?.slice(0, 160)}`);
  const leadApprove = await lead('POST',
    '/appraisal/reviews/00000000-0000-0000-0000-000000000001/approve', {});
  ok('team lead approve -> 403', leadApprove.status === 403, `-> ${leadApprove.status}`);

  const ownEvals = await emp('GET', '/appraisal/my-evaluations');
  ok('employee my-evaluations -> 200', ownEvals.status === 200, `-> ${ownEvals.status}`);

  // ---------------------------------------------------------------- dashboards + notifications
  console.log('\n== DASHBOARDS / NOTIFICATIONS ==');
  const leadDash = await lead('GET', '/appraisal/dashboard/team-lead');
  ok('team-lead dashboard -> 200', leadDash.status === 200,
    `-> ${leadDash.status} ${leadDash.text?.slice(0, 200)}`);
  const empDash = await emp('GET', '/appraisal/dashboard/employee');
  ok('employee dashboard -> 200', empDash.status === 200,
    `-> ${empDash.status} ${empDash.text?.slice(0, 200)}`);
  const notifs = await lead('GET', '/appraisal/notifications');
  ok('notifications -> 200 array', notifs.status === 200 && Array.isArray(notifs.json),
    `-> ${notifs.status}`);

  // ---------------------------------------------------------------- excel exports
  console.log('\n== EXCEL EXPORT ==');
  const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const statsX = await hr('GET', '/appraisal/stats/export/excel');
  ok('stats excel content-type', statsX.status === 200 &&
    (statsX.headers.get('content-type') ?? '').includes(XLSX),
    `-> ${statsX.status} ${statsX.headers.get('content-type')}`);
  ok('stats excel non-empty', (statsX.text?.length ?? 0) > 1000, `-> ${statsX.text?.length} bytes`);

  console.log('\n== STATS SHAPE ==');
  const stats = await hr('GET', '/appraisal/stats');
  // The spec figures live under `summary`; the envelope also carries trend /
  // byStatus / byDepartment for the charts.
  const s = stats.json?.summary ?? {};
  const wanted = ['workingDays', 'submittedForms', 'pendingForms', 'approvedForms',
    'absents', 'employeesOnLeave', 'averageScore', 'grossScore'];
  const missing = wanted.filter((k) => !(k in s));
  ok('stats carries the spec fields', stats.status === 200 && missing.length === 0,
    `-> ${stats.status} missing=[${missing}] keys=[${Object.keys(s)}]`);

  const r = report();
  console.log(`\n==== ${r.pass} passed, ${r.fail} failed ====`);
  process.exit(r.fail === 0 ? 0 : 1);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
