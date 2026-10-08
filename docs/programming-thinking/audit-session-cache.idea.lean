-- Core/Std model of incremental scope commits. Accepted foundations: propext and Quot.sound.
import Std

set_option autoImplicit false

namespace IncrementalAudit

-- Provenance is supplied by the projection contract, not inferred from text.
-- Source ids denote original branch records; this model never invents acceptance items.
inductive Role where
  | user | assistant | tool | summary | ambient | bookkeeping
  deriving DecidableEq, Repr

structure Source where
  id : Nat
  role : Role
  publicOnBranch : Bool
  deriving DecidableEq, Repr

-- A complete loop contains every called tool's result. Cursor indices abstract ordered branch loop ids.
structure Loop where
  id : Nat
  calls : List Nat
  results : List Nat
  deriving DecidableEq, Repr

def complete (loop : Loop) : Bool := loop.calls.all (fun id => decide (id ∈ loop.results))
def suffix (cursor : Nat) (loops : List Loop) : List Loop := loops.filter (fun loop => decide (cursor < loop.id))

-- Business memory keeps report identities and permission separately; a completion is only a report.
structure Scope where
  cursor : Nat := 0
  openFrom : Option Nat := none
  progressReports : List Nat := []
  completionReport : Option Nat := none
  permission : Option Nat := none
  waiting : Bool := true
  deriving DecidableEq, Repr

-- Finite answers distinguish absence of change, concrete partial reports, completion, uncertainty and authority changes.
inductive Delta where
  | unchanged
  | partialProgress (source : Source)
  | completion (source : Source)
  | uncertain
  | grant (source : Source)
  | withdraw (source : Source)
  deriving DecidableEq, Repr

-- These acknowledgements are environmental contracts: current input ownership, durable append and complete-loop coverage.
structure Admission where
  current : Bool
  acknowledged : Bool
  completeLoops : Bool
  deriving DecidableEq, Repr

def admitted (a : Admission) : Bool := a.current && a.acknowledged && a.completeLoops

def reportSource (s : Source) : Bool :=
  s.publicOnBranch && decide (s.role = .user ∨ s.role = .assistant)

def userSource (s : Source) : Bool := s.publicOnBranch && decide (s.role = .user)

def advance (s : Scope) (last : Nat) : Scope := { s with cursor := last, openFrom := none }
def holdOpen (s : Scope) (first : Nat) : Scope := { s with openFrom := s.openFrom.or (some first) }

-- Transitions neither summarize source text nor derive execution permission from reported completion.
-- Ordered range bounds and source truth remain caller assumptions, not conclusions of this model.
def transition (s : Scope) (first last : Nat) (d : Delta) : Scope :=
  match d with
  | .unchanged => advance s last
  | .uncertain => holdOpen s first
  | .partialProgress src =>
      if reportSource src then
        advance { s with progressReports := src.id :: s.progressReports, completionReport := none } last
      else holdOpen s first
  | .completion src =>
      if reportSource src then advance { s with completionReport := some src.id } last
      else holdOpen s first
  | .grant src =>
      if userSource src then advance { s with permission := some src.id, waiting := false } last
      else holdOpen s first
  | .withdraw src =>
      if userSource src then advance { s with permission := none, waiting := true } last
      else holdOpen s first

-- Publication is gated before replacing one scope; all other scopes are untouched.
def commit (s : Scope) (first last : Nat) (d : Delta) (a : Admission) : Scope :=
  if admitted a then transition s first last d else s

def updateScope (states : Nat → Scope) (selected : Nat) (next : Scope) : Nat → Scope :=
  fun id => if id = selected then next else states id

def mayExecute (s : Scope) : Bool := s.permission.isSome && !s.waiting && s.openFrom.isNone

-- Full re-judgment invalidates permission before any replacement judgment is accepted.
def resetFull : Scope := { openFrom := some 0 }

-- Failed ownership, persistence or loop coverage leaves the previously durable scope unchanged.
theorem stale_preserves_state (s : Scope) (first last : Nat) (d : Delta) (ack completeLoops : Bool) :
    commit s first last d ⟨false, ack, completeLoops⟩ = s := by
  simp [commit, admitted]

theorem failed_write_preserves_state (s : Scope) (first last : Nat) (d : Delta) (current completeLoops : Bool) :
    commit s first last d ⟨current, false, completeLoops⟩ = s := by
  simp [commit, admitted]

theorem incomplete_loop_preserves_state (s : Scope) (first last : Nat) (d : Delta) (current ack : Bool) :
    commit s first last d ⟨current, ack, false⟩ = s := by
  simp [commit, admitted]

-- Uncertain answers hold the cursor; partial and whole-completion reports preserve concrete provenance.
theorem uncertain_never_advances (s : Scope) (first last : Nat) (a : Admission) :
    (commit s first last .uncertain a).cursor = s.cursor := by
  unfold commit
  split <;> rfl

theorem partial_preserves_specific_report (s : Scope) (first last : Nat) (src : Source)
    (h : reportSource src = true) :
    (commit s first last (.partialProgress src) ⟨true, true, true⟩).progressReports = src.id :: s.progressReports ∧
    (commit s first last (.partialProgress src) ⟨true, true, true⟩).cursor = last := by
  simp [commit, admitted, transition, h, advance]

theorem completion_keeps_prior_facts (s : Scope) (first last : Nat) (src : Source)
    (h : reportSource src = true) :
    (commit s first last (.completion src) ⟨true, true, true⟩).progressReports = s.progressReports := by
  simp [commit, admitted, transition, h, advance]

-- Permission is independent of completion, and a supported withdrawal prevents execution.
theorem completion_is_not_permission (s : Scope) (first last : Nat) (src : Source) (a : Admission) :
    (commit s first last (.completion src) a).permission = s.permission := by
  unfold commit
  split
  · simp only [transition]
    split <;> rfl
  · rfl

theorem withdrawal_disables_execution (s : Scope) (first last : Nat) (src : Source)
    (h : userSource src = true) :
    mayExecute (commit s first last (.withdraw src) ⟨true, true, true⟩) = false := by
  simp [commit, admitted, transition, h, advance, mayExecute]

-- Scope isolation and suffix selection establish the modeled no-replay and complete-loop boundaries.
theorem untouched_scope_is_unchanged (states : Nat → Scope) (selected other : Nat) (next : Scope)
    (h : other ≠ selected) : updateScope states selected next other = states other := by
  simp [updateScope, h]

theorem suffix_contains_no_old_loop (cursor : Nat) (loops : List Loop) (loop : Loop)
    (h : loop ∈ suffix cursor loops) : cursor < loop.id := by
  have member := List.mem_filter.mp h
  exact of_decide_eq_true member.2

theorem complete_loop_has_every_result (loop : Loop) (h : complete loop = true) (call : Nat)
    (member : call ∈ loop.calls) : call ∈ loop.results := by
  have result := List.all_eq_true.mp h call member
  exact of_decide_eq_true result

theorem reset_cannot_execute : mayExecute resetFull = false := by rfl

-- Combined protocol safety only: not classifier accuracy, real JSONL durability, tokenizer correctness or TypeScript equivalence.
theorem process_is_correct (s : Scope) (first last : Nat) (d : Delta) (a : Admission) (src : Source) :
    commit s first last d ⟨false, a.acknowledged, a.completeLoops⟩ = s ∧
    commit s first last d ⟨a.current, false, a.completeLoops⟩ = s ∧
    commit s first last d ⟨a.current, a.acknowledged, false⟩ = s ∧
    (commit s first last .uncertain a).cursor = s.cursor ∧
    (commit s first last (.completion src) a).permission = s.permission ∧
    (userSource src = true → mayExecute (commit s first last (.withdraw src) ⟨true, true, true⟩) = false) := by
  exact ⟨stale_preserves_state s first last d a.acknowledged a.completeLoops,
    failed_write_preserves_state s first last d a.current a.completeLoops,
    incomplete_loop_preserves_state s first last d a.current a.acknowledged,
    uncertain_never_advances s first last a, completion_is_not_permission s first last src a,
    withdrawal_disables_execution s first last src⟩

-- Inspect every trusted foundation of the protocol and loop-boundary claims.
#print axioms process_is_correct
#print axioms suffix_contains_no_old_loop
#print axioms complete_loop_has_every_result

end IncrementalAudit

-- Deterministic stdout only. No filesystem, subprocess, network or provider calls.
def main : IO Unit := do
  IO.println "Incremental scopes: only current, acknowledged, complete-loop judgments commit."
  IO.println "Partial reports retain concrete source identities; uncertainty cannot advance a cursor."
  IO.println "Completion is not permission; user withdrawal disables execution."
  IO.println "Proof scope: protocol guards and source references, not classifier truth, tokenizer accuracy, or TypeScript equivalence."
