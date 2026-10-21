-- Core/Std model only; accepted foundations are propext, Quot.sound and Classical.choice.
import Std

set_option autoImplicit false

namespace InProgressLimit

-- Tasks contribute only their status; branch entries retain finalized assistant loops and delivered reminder markers.
inductive TaskStatus where
  | pending | inProgress | completed | deleted
  deriving BEq, DecidableEq, Repr

inductive BranchEntry where
  | assistantLoop
  | limitReminder (loop : Nat)
  | other
  deriving DecidableEq, Repr

-- Replay always uses the selected branch, not abandoned histories or an in-memory session-wide cooldown.
structure Clock where
  totalLoops : Nat := 0
  lastReminder : Option Nat := none
  deriving DecidableEq, Repr

def record (clock : Clock) (entry : BranchEntry) : Clock :=
  match entry with
  | .assistantLoop => { clock with totalLoops := clock.totalLoops + 1 }
  | .limitReminder loop => { clock with lastReminder := some loop }
  | .other => clock

def replay (activeBranch : List BranchEntry) : Clock := activeBranch.foldl record {}

-- Only active tasks consume capacity; neither JEV state nor user-message cooldown is a guard input.
def activeCount (board : List TaskStatus) : Nat := (board.filter (· == .inProgress)).length

def cooldownExpired (clock : Clock) : Bool :=
  match clock.lastReminder with
  | none => true
  | some previous => decide (previous + 10 ≤ clock.totalLoops)

def shouldRemind (enabled : Bool) (board : List TaskStatus) (clock : Clock) : Bool :=
  enabled && decide (3 < activeCount board) && cooldownExpired clock

-- Observation occurs after all turn results are recorded; successful delivery appends only a reminder marker.
-- Host recording, delivery and loop identity are environmental assumptions, not TypeScript-equivalence claims.
structure Outcome where
  reminder : Bool
  board : List TaskStatus
  authorized : Bool
  triggerTurn : Bool := false
  branch : List BranchEntry
  deriving DecidableEq, Repr

def observeRecordedTurn (enabled : Bool) (board : List TaskStatus)
    (activeBranch : List BranchEntry) (authorized : Bool) : Outcome :=
  let clock := replay activeBranch
  let reminder := shouldRemind enabled board clock
  { reminder, board, authorized,
    branch := if reminder then activeBranch ++ [.limitReminder clock.totalLoops] else activeBranch }

-- Pending queue length cannot change active capacity, and disabled or within-limit boards remain silent.
theorem pending_queue_unlimited (board : List TaskStatus) (pending : Nat) :
    activeCount (board ++ List.replicate pending .pending) = activeCount board := by
  simp [activeCount, List.filter_append, show (TaskStatus.pending == TaskStatus.inProgress) = false from rfl]

theorem three_or_fewer_silent (enabled : Bool) (board : List TaskStatus) (clock : Clock)
    (withinLimit : activeCount board ≤ 3) : shouldRemind enabled board clock = false := by
  have notOver : ¬3 < activeCount board := by omega
  simp [shouldRemind, notOver]

theorem disabled_silent (board : List TaskStatus) (clock : Clock) :
    shouldRemind false board clock = false := by
  simp [shouldRemind]

-- First excess is eligible immediately; subsequent excess stays silent below ten loops and eligible from ten onward.
theorem first_over_limit_immediate (board : List TaskStatus) (loop : Nat)
    (overLimit : 3 < activeCount board) : shouldRemind true board ⟨loop, none⟩ = true := by
  simp [shouldRemind, cooldownExpired, overLimit]

theorem distances_below_ten_silent (enabled : Bool) (board : List TaskStatus) (loop previous : Nat)
    (tooSoon : loop < previous + 10) : shouldRemind enabled board ⟨loop, some previous⟩ = false := by
  have notDue : ¬previous + 10 ≤ loop := by omega
  simp [shouldRemind, cooldownExpired, notDue]

theorem distance_ten_or_more_reminds (board : List TaskStatus) (loop previous : Nat)
    (overLimit : 3 < activeCount board) (due : previous + 10 ≤ loop) :
    shouldRemind true board ⟨loop, some previous⟩ = true := by
  simp [shouldRemind, cooldownExpired, overLimit, due]

-- The enabled, active-count and branch-local cooldown guards are necessary and sufficient for an advisory.
theorem exact_guard (enabled : Bool) (board : List TaskStatus) (branch : List BranchEntry) (authorized : Bool) :
    (observeRecordedTurn enabled board branch authorized).reminder = true ↔
      enabled = true ∧ 3 < activeCount board ∧
        match (replay branch).lastReminder with
        | none => True
        | some previous => previous + 10 ≤ (replay branch).totalLoops := by
  cases last : (replay branch).lastReminder <;>
    simp [observeRecordedTurn, shouldRemind, cooldownExpired, last, Bool.and_eq_true, and_assoc]

-- A successfully delivered marker restores the same reminder clock after reload or branch reselection.
theorem appended_reminder_restores_clock (branch : List BranchEntry) :
    replay (branch ++ [.limitReminder (replay branch).totalLoops]) =
      { replay branch with lastReminder := some (replay branch).totalLoops } := by
  simp [replay, List.foldl_append, record]

-- This total observer terminates with the exact guard result, unchanged board/permission, and no terminal-wake request.
-- A silent outcome preserves the branch; a reminder outcome records the current loop for subsequent replay.
theorem process_is_correct (enabled : Bool) (board : List TaskStatus) (branch : List BranchEntry)
    (authorized : Bool) :
    let result := observeRecordedTurn enabled board branch authorized
    (result.reminder = true ↔ enabled = true ∧ 3 < activeCount board ∧
      match (replay branch).lastReminder with
      | none => True
      | some previous => previous + 10 ≤ (replay branch).totalLoops) ∧
    result.board = board ∧ result.authorized = authorized ∧ result.triggerTurn = false ∧
    (result.reminder = false → result.branch = branch) ∧
    (result.reminder = true → replay result.branch =
      { replay branch with lastReminder := some (replay branch).totalLoops }) := by
  dsimp only
  refine ⟨exact_guard enabled board branch authorized, rfl, rfl, rfl, ?_, ?_⟩
  · intro silent
    change shouldRemind enabled board (replay branch) = false at silent
    simp only [observeRecordedTurn, silent, Bool.false_eq_true, ↓reduceIte]
  · intro sent
    change shouldRemind enabled board (replay branch) = true at sent
    simpa only [observeRecordedTurn, sent, ↓reduceIte] using appended_reminder_restores_clock branch

-- Inspect trusted foundations for the combined contract and its pending/cooldown boundary claims.
#print axioms process_is_correct
#print axioms pending_queue_unlimited
#print axioms distances_below_ten_silent
#print axioms distance_ten_or_more_reminds

-- Concrete branch examples expose the off-by-one boundary without provider or filesystem effects.
def exampleBranch : List BranchEntry := [.assistantLoop, .limitReminder 1]
def fourActive : List TaskStatus := List.replicate 4 .inProgress

end InProgressLimit

-- Deterministic stdout illustrates the proved boundary; runtime persistence and scheduling remain outside this model.
def main : IO Unit := do
  let branch := InProgressLimit.exampleBranch
  let atNine := branch ++ List.replicate 9 .assistantLoop
  let atTen := branch ++ List.replicate 10 .assistantLoop
  IO.println s!"Distance 9 reminder: {(InProgressLimit.observeRecordedTurn true InProgressLimit.fourActive atNine false).reminder}"
  IO.println s!"Distance 10 reminder: {(InProgressLimit.observeRecordedTurn true InProgressLimit.fourActive atTen false).reminder}"
  IO.println "Proved: only enabled boards above three active tasks remind, initially or after ten loops."
  IO.println "Pending is unlimited; board and authorization stay unchanged; no terminal wake is requested."
