/* Temporary live-probe run, part 2: reuse/snapshot, submit lock, workflow, scoping. */
const { ok, login, api, report } = require('./probe-appraisal.cjs');

const LEAD_ID = '1feaa087-dccf-4d7c-b4b1-13f802db65ce';
const EMP_ID = '747f538e-96b2-4507-927a-1ce033a6502c';
const DEPT_ID = 'd3946341-fd24-4ef6-b808-ff18cdfade85';

const stamp = Date.now();

(async () => {
  const hr = api(await login('hr.admin@hrms.local'));
  const lead = api(await login('team.lead@hrms.local'));
  const emp = api(await login('employee@hrms.local'));

  // ------------------------------------------------ bank reuse + snapshot isolation
  console.log('\n== REUSE + SNAPSHOT ISOLATION ==');
  const mk = async (body) => {
    const r = await hr('POST', '/appraisal/questions', body);
    return r.json?.question?.questionId;
  };
  const qRating = await mk({ questionText: `Original wording ${stamp}`, questionType: 'rating' });
  const qYesNo = await mk({ questionText: `YesNo ${stamp}`, questionType: 'yes_no' });
  const qChoice = await mk({
    questionText: `Choice ${stamp}`, questionType: 'multiple_choice',
    options: [{ optionText: 'Poor', score: 0 }, { optionText: 'Good', score: 4 },
      { optionText: 'Great', score: 8 }],
  });
  const qDrop = await mk({
    questionText: `Drop ${stamp}`, questionType: 'dropdown',
    options: [{ optionText: 'No', score: 0 }, { optionText: 'Yes', score: 10 }],
  });
  const qText = await mk({ questionText: `Text ${stamp}`, questionType: 'text_feedback' });
  ok('created 5 reusable bank questions', [qRating, qYesNo, qChoice, qDrop, qText].every(Boolean));

  const newForm = async (name, evaluationType = 'Monthly') => {
    const r = await hr('POST', '/appraisal/forms', { formName: name, evaluationType });
    return r.json?.formId ?? r.json?.form_id;
  };
  const formA = await newForm(`Probe A ${stamp}`);
  const formB = await newForm(`Probe B ${stamp}`);

  const fourTypes = [
    { bankQuestionId: qRating, weightage: 25, isActive: true, ratingScale: 10 },
    { bankQuestionId: qYesNo, weightage: 25, isActive: true },
    { bankQuestionId: qChoice, weightage: 25, isActive: true },
    { bankQuestionId: qDrop, weightage: 25, isActive: true },
    { bankQuestionId: qText, weightage: 0, isActive: true },
  ];
  const sA = await hr('PUT', `/appraisal/forms/${formA}/questions`, { questions: fourTypes });
  const sB = await hr('PUT', `/appraisal/forms/${formB}/questions`, { questions: fourTypes });
  ok('same bank questions attached to two forms', sA.status < 300 && sB.status < 300,
    `-> A=${sA.status} B=${sB.status} ${sA.text?.slice(0, 200)}`);

  const pubA = await hr('POST', `/appraisal/forms/${formA}/publish`);
  ok('publish form A', pubA.status < 300, `-> ${pubA.status} ${pubA.text?.slice(0, 200)}`);

  // Edit the bank question after A is published. A holds a snapshot; B is Draft.
  const edit = await hr('PUT', `/appraisal/questions/${qRating}`,
    { questionText: `EDITED wording ${stamp}` });
  ok('edit a bank question used by a published form -> 200', edit.status === 200,
    `-> ${edit.status} ${edit.text?.slice(0, 200)}`);
  ok('edit response names the unaffected published form',
    (edit.json?.unaffectedPublishedForms ?? []).length >= 1,
    `-> unaffected=${JSON.stringify(edit.json?.unaffectedPublishedForms)}`);
  ok('edit response names the affected draft form',
    (edit.json?.affectedDraftForms ?? []).length >= 1,
    `-> affected=${JSON.stringify(edit.json?.affectedDraftForms)}`);

  const detA = await hr('GET', `/appraisal/forms/${formA}`);
  const detB = await hr('GET', `/appraisal/forms/${formB}`);
  const textsA = (detA.json?.questions ?? []).map((q) => q.criteriaName ?? q.questionText);
  const textsB = (detB.json?.questions ?? []).map((q) => q.criteriaName ?? q.questionText);
  ok('published form A keeps the ORIGINAL wording',
    textsA.some((t) => (t ?? '').includes('Original wording')),
    `-> ${JSON.stringify(textsA)}`);
  ok('draft form B shows the EDITED wording',
    textsB.some((t) => (t ?? '').includes('EDITED wording')),
    `-> ${JSON.stringify(textsB)}`);

  // ------------------------------------------------ assign form A to the employee
  console.log('\n== ASSIGN + SUBMIT LOCK ==');
  // Assignment precedence is user -> designation -> department, so a per-user
  // assignment wins over whatever the department already had.
  const assign = await hr('POST', `/appraisal/forms/${formA}/assignments`, {
    employeeId: EMP_ID,
  });
  ok('assign published form to employee', assign.status < 300,
    `-> ${assign.status} ${assign.text?.slice(0, 250)}`);

  // Lead must be able to see this employee and open the form.
  const roster = await lead('GET', '/appraisal/my-team');
  const onRoster = (roster.json ?? []).some((m) => m.employeeId === EMP_ID);
  ok('employee visible on lead roster (DEPARTMENT mode)', onRoster,
    `-> ${roster.status} n=${(roster.json ?? []).length}`);

  const formForEmp = await lead('GET', `/appraisal/evaluate/${EMP_ID}`);
  ok('lead can open the evaluation form', formForEmp.status === 200,
    `-> ${formForEmp.status} ${formForEmp.text?.slice(0, 250)}`);

  const qs = formForEmp.json?.questions ?? [];
  ok('form carries all 5 question types', new Set(qs.map((q) => q.questionType)).size === 5,
    `-> ${JSON.stringify(qs.map((q) => q.questionType))}`);

  const period = `Probe ${stamp}`;
  const scores = qs.map((q) => {
    if (q.questionType === 'rating') return { questionId: q.questionId, score: 8 };
    if (q.questionType === 'text_feedback') {
      return { questionId: q.questionId, remarks: 'free text answer' };
    }
    // option types: pick the highest-scoring option so the stored % is checkable
    const best = [...(q.options ?? [])].sort((a, b) => Number(b.score) - Number(a.score))[0];
    return { questionId: q.questionId, selectedOptionId: best?.optionId };
  });

  const submit1 = await lead('POST', `/appraisal/evaluate/${EMP_ID}`, {
    reviewPeriod: period, comments: 'probe submit', recommendation: 'n/a', scores,
  });
  ok('first submit -> 2xx', submit1.status < 300,
    `-> ${submit1.status} ${submit1.text?.slice(0, 300)}`);
  const reviewId = submit1.json?.appraisalId ?? submit1.json?.reviewId;

  const submit2 = await lead('POST', `/appraisal/evaluate/${EMP_ID}`, {
    reviewPeriod: period, comments: 'second attempt', recommendation: 'n/a', scores,
  });
  ok('double submit same period -> 409', submit2.status === 409,
    `-> ${submit2.status} ${submit2.text?.slice(0, 200)}`);

  // top-scored options on every option question + 8/10 rating => 85%
  // (25*80 + 25*100 + 25*100 + 25*100)/100 = 95
  const myEvals = await emp('GET', '/appraisal/my-evaluations');
  const mine = (myEvals.json?.evaluations ?? []).find((e) => e.reviewPeriod === period);
  ok('employee sees the submitted review', !!mine,
    `-> periods=${JSON.stringify((myEvals.json?.evaluations ?? []).map((e) => e.reviewPeriod).slice(0, 5))}`);
  ok('option-based scores normalised to 100%',
    !!mine && Math.abs(mine.totalScore - 95) < 0.51, `-> totalScore=${mine?.totalScore}`);
  ok('SubmittedEvaluation carries evaluationType', !!mine?.evaluationType,
    `-> ${mine?.evaluationType}`);

  // ------------------------------------------------ workflow
  console.log('\n== APPROVE / REJECT / REOPEN ==');
  const approvals0 = await hr('GET', `/appraisal/reviews/${reviewId}/approvals`);
  ok('SUBMIT row written', (approvals0.json?.approvals ?? approvals0.json ?? []).length === 1,
    `-> ${approvals0.status} ${approvals0.text?.slice(0, 250)}`);

  const approve = await hr('POST', `/appraisal/reviews/${reviewId}/approve`,
    { comment: 'looks right' });
  ok('approve -> 2xx, status Approved',
    approve.status < 300 && approve.json?.status === 'Approved',
    `-> ${approve.status} ${approve.text?.slice(0, 250)}`);

  const approveAgain = await hr('POST', `/appraisal/reviews/${reviewId}/approve`, {});
  ok('approve an already-approved review -> 409', approveAgain.status === 409,
    `-> ${approveAgain.status}`);

  const reopen = await hr('POST', `/appraisal/reviews/${reviewId}/reopen`,
    { comment: 'needs a redo' });
  ok('reopen -> status Draft', reopen.status < 300 && reopen.json?.status === 'Draft',
    `-> ${reopen.status} ${reopen.text?.slice(0, 250)}`);
  ok('reopen trail now has 3 rows',
    (reopen.json?.approvals ?? []).length === 3,
    `-> ${(reopen.json?.approvals ?? []).length}`);

  const resubmit = await lead('POST', `/appraisal/evaluate/${EMP_ID}`, {
    reviewPeriod: period, comments: 'resubmitted after reopen', recommendation: 'n/a', scores,
  });
  ok('lead can resubmit after reopen -> 2xx', resubmit.status < 300,
    `-> ${resubmit.status} ${resubmit.text?.slice(0, 200)}`);

  // ------------------------------------------------ MEMBERS-mode scoping
  console.log('\n== MEMBERS-MODE SCOPING ==');
  const existing = await hr('GET', '/appraisal/team-lead-assignments');
  const leadRows = (existing.json?.data ?? existing.json ?? [])
    .filter((a) => a.teamLeadId === LEAD_ID);
  for (const row of leadRows) {
    await hr('DELETE', `/appraisal/team-lead-assignments/${row.assignmentId}`);
  }
  // Narrow the lead to a member list that deliberately EXCLUDES our employee.
  const others = (roster.json ?? []).filter((m) => m.employeeId !== EMP_ID).slice(0, 1);
  const created = await hr('POST', '/appraisal/team-lead-assignments', {
    teamLeadId: LEAD_ID, mode: 'MEMBERS',
    memberIds: others.length ? others.map((m) => m.employeeId) : [LEAD_ID],
  });
  ok('create MEMBERS-mode assignment', created.status < 300,
    `-> ${created.status} ${created.text?.slice(0, 250)}`);

  const roster2 = await lead('GET', '/appraisal/my-team');
  ok('excluded employee gone from roster',
    !(roster2.json ?? []).some((m) => m.employeeId === EMP_ID),
    `-> ${JSON.stringify((roster2.json ?? []).map((m) => m.employeeId))}`);

  const blockedRead = await lead('GET', `/appraisal/evaluate/${EMP_ID}`);
  ok('read excluded employee -> 403', blockedRead.status === 403, `-> ${blockedRead.status}`);
  const blockedWrite = await lead('POST', `/appraisal/evaluate/${EMP_ID}`, {
    reviewPeriod: `Blocked ${stamp}`, comments: 'x', recommendation: 'x', scores,
  });
  ok('SUBMIT for excluded employee -> 403 (write path scoped too)',
    blockedWrite.status === 403, `-> ${blockedWrite.status} ${blockedWrite.text?.slice(0, 200)}`);

  // XOR: MEMBERS mode must reject a departmentId
  const xor = await hr('POST', '/appraisal/team-lead-assignments', {
    teamLeadId: LEAD_ID, mode: 'MEMBERS', departmentId: DEPT_ID, memberIds: [EMP_ID],
  });
  ok('MEMBERS mode + departmentId -> 400', xor.status === 400, `-> ${xor.status}`);

  // Restore department-wide access so the environment is left as found.
  const cleanup = await hr('GET', '/appraisal/team-lead-assignments');
  for (const row of (cleanup.json?.data ?? cleanup.json ?? []).filter((a) => a.teamLeadId === LEAD_ID)) {
    await hr('DELETE', `/appraisal/team-lead-assignments/${row.assignmentId}`);
  }
  const restored = await hr('POST', '/appraisal/team-lead-assignments', {
    teamLeadId: LEAD_ID, mode: 'DEPARTMENT', departmentId: DEPT_ID,
  });
  ok('restored DEPARTMENT-mode assignment', restored.status < 300,
    `-> ${restored.status} ${restored.text?.slice(0, 200)}`);

  const r = report();
  console.log(`\n==== ${r.pass} passed, ${r.fail} failed ====`);
  process.exit(r.fail === 0 ? 0 : 1);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
