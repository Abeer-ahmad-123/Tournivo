CREATE FUNCTION tournivo_immutable_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Published content and audit history are immutable; append a new version or correction' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER immutable_custom_rules BEFORE UPDATE OR DELETE ON custom_rules
FOR EACH ROW EXECUTE FUNCTION tournivo_immutable_history();
--> statement-breakpoint
CREATE TRIGGER immutable_rulebook_versions BEFORE UPDATE OR DELETE ON rulebook_versions
FOR EACH ROW EXECUTE FUNCTION tournivo_immutable_history();
--> statement-breakpoint
CREATE TRIGGER immutable_acknowledgements BEFORE UPDATE OR DELETE ON rule_acknowledgements
FOR EACH ROW EXECUTE FUNCTION tournivo_immutable_history();
--> statement-breakpoint
CREATE TRIGGER immutable_match_results BEFORE UPDATE OR DELETE ON match_results
FOR EACH ROW EXECUTE FUNCTION tournivo_immutable_history();
--> statement-breakpoint
CREATE TRIGGER immutable_disciplinary_decisions BEFORE UPDATE OR DELETE ON disciplinary_decisions
FOR EACH ROW EXECUTE FUNCTION tournivo_immutable_history();
--> statement-breakpoint
CREATE TRIGGER immutable_audit_logs BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION tournivo_immutable_history();
--> statement-breakpoint
ALTER TABLE tournaments ADD CONSTRAINT tournament_champion_belongs_to_tournament
FOREIGN KEY (champion_id, id) REFERENCES participants(id, tournament_id);
--> statement-breakpoint
CREATE FUNCTION tournivo_case_rule_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM custom_rules r
    JOIN rulebook_versions v ON v.id = r.version_id
    JOIN rulebooks b ON b.id = v.rulebook_id
    WHERE r.id = NEW.rule_id AND b.tournament_id = NEW.tournament_id AND b.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Disciplinary rule must belong to the same tournament and organization' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER disciplinary_case_rule_scope BEFORE INSERT OR UPDATE ON disciplinary_cases
FOR EACH ROW EXECUTE FUNCTION tournivo_case_rule_scope();
