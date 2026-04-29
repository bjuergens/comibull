
claude has some hard limits, that are annoying to work around. 

to avoid context pollution, these workarounds are in a separate file, because if claude accidentally reads this, he may try to doublefuck himself. 

## general workflow

1. create new session for the feature
2. claude will create new branch for changes
3. human create PR
4. tell claude to fix ci issues, usually just tell him: `run check.sh`
5. tell claude to review in session (this will pick up review.md)
   * look through the toplevel claude logs. sometimes he does stupid shit. 
   * if he asks what issues to fix, ask him to reread claude.md
   * you will have to judge yourself which findings are relevant. claude is bad at this
8. out-of-session review: create new session and tell it to review branch from first session. e.g. `review claude/migrate-saq-postgres-XIepp`
9. optional: use the extra review skills (e.g. osterhout redflags)
10. test manually on testing (it has state from the last branch where ci was successfully)

## review/

initialer review, wo eine eine sache geziehlt wird (redlags? datenfluss? errorhandling? comments/names/types? fronted/back? etc)

```
review and search red flags in frontend. flag issues that hint at bad software-design/architecture. flag design smells. flag symptoms. 
```

und nachdem 100 sachen geflaggt wurden: 

```
please make a plan to fix issues. for each suggested fix, is it justified per claudemd?

at the end add steps:
* reviewing. options for further improvmeent and reduction of complexity.
* implementation of further improvements.
* rereviewing.
* detecting tension with claudemd/reviewmd.
* judging if the fixes actually improved the big picture.
* then undoing damage.
* than final review and judgment

please note: We are hunting for design errors, that radiate complexity. So the biggest wins, would simplify multiple parts of the system. 
```

und am ende dann nochmal eine zusammenfassung generieren

```
merge main into f
rereead claudemd and reviewmd
then rereview
then answer: what was changed on this branch and why
```

und manuell den diff durchlesen/überfliegen

## review from tests

ggf in planning mode?

```
look at unit tests, that target edge cases. each of these tests is a smell for deviation from our "fail fast" design principle. I want to get rid of the complexity, where these edge cases even arrived from, so we want to look at the source for these edgecases and the source's source. The biggest wins are the refactorings that simplify many parts of the system, so while we start our search with test edge cases, all parts of the system are valid targets for restructuring, even the ui, the requirements and the functional requirements. 

for each of these unit tests, trace a path thru the application, where this can happen. mark every place, where we could tighten the flow/branches/data. Where could we simplify requirements to define the edge cases away?

summarize the findings. I will decide which findings we will act upon
```

## tests are red flags

siehe auch "define errors out of existence"

```
look at unit tests in backend, that test edge cases. each of these tests is a smell for deviation from our "fail fast" design principle. I want to get rid of the complexity, where these edge cases even arrived from, so we want to look at the source for these edgecases and the sources source. The biggest wins are the refactorings that simplify many parts of the system, so while we start our search with backend edge cases, all parts of the system are valid targets for restructuring, even the ui, the requirements and the even most minor functions of the app. 

for each of these backend unit tests, trace a path thru the application, where this can happen. mark every place, where we could tighten the flow/branches/data. Where could we simplify requirements to define the edge cases away?

summarize the findings. I will decide which findings we will act upon
```

## claude fucked himself into a corner

symptom: he adds layers of onion code and workarounds

Problem: systemprompt tells him to be conservative and only change some small things at a time. It's hard to compell him to do a fresh architecture, that breaks old assumptions and requirements

Solution:

* Tell him to remove the problematic architecture entirely on new branch.
** planning mode works well here, because you can review where it will make the cut, and tell him where to add stubs.
* Implement from scratch in new session.
** tell him to research explicitly. 


Example: 

```
we want to create a clean slate for a redesign of the worker code and the page processing and the pricing.

delete tasks table and related code. delete tasks api and related code. delete pricing and task costs and related code.

we expect some tests to fail after achieving clean slate. This is fine.
```

followed by re-implementing the feature from scratch in a new session 

```
implement worker with **SAQ (`saq[postgres]`)**

- Two task types: `DETECT_PAGE` (CPU/OpenCV) and `ANALYZE_REGIONS` (I/O/Anthropic API)
- see ai.py for the actual code that the worker will run to complete the tasks. 
- Task triggered via relevant buttons in UI (should be mocked currently)
- WebSocket push on task completion
- FailFast and Loud. We'll take care about stability in a later step 
- stay with  official guidelines

current situation: we removed all the old stuff so we can do a complete redesign now. Please ignore the old implementation completely. We are starting from scratch here. 

todo: 
 
1. Research SAQ's Postgres backend
2. Research SAQ guides. 
3. Plan and implement the migration. You are free to restructure the DB model, schema, constraints as you sees fit

### No constraints

The session may ignore CLAUDE.md constraints. It may change the DB schema, status lifecycle,  — whatever makes the SAQ integration clean. Just flag what changed at the end.
```


