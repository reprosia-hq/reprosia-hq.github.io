#!/usr/bin/env Rscript
# ------------------------------------------------------------------------------
# Worked example for the Reprosia site: an audit trail and a reproducibility check
# on one small analysis, using regulog and reproducr.
#
# Data: ToothGrowth (built into R). It is public teaching data, not clinical data.
# Run:  Rscript case-study.R
# Then send me (or paste) the file  case-study-output.txt  and I will build the page
# from the real output. Nothing here needs the internet.
# ------------------------------------------------------------------------------

suppressPackageStartupMessages({ library(regulog); library(reproducr) })

out_txt <- "case-study-output.txt"
sink(out_txt, split = TRUE)
sec <- function(x) cat("\n##### ", x, "\n", sep = "")

sec("A. Versions")
cat(R.version.string, "\n")
cat("regulog", as.character(utils::packageVersion("regulog")), "\n")
cat("reproducr", as.character(utils::packageVersion("reproducr")), "\n")

# ---- B. An audit trail for the analysis --------------------------------------
sec("B1. Start the log")
rlog <- tempfile(fileext = ".rlog")
log <- regulog_init(app = "toothgrowth-example", version = "1.0", user = "jsmith", path = rlog)
log_note(log, "Question: does tooth length depend on dose and supplement type? Analysis plan v1: linear model, dose as numeric.")
data_csv <- tempfile(fileext = ".csv")
utils::write.csv(ToothGrowth, data_csv, row.names = FALSE)
tg <- rl_read(log, utils::read.csv, data_csv)
cat("Rows read:", nrow(tg), "\n")

sec("B2. Fit the first model and record it")
fit1 <- lm(len ~ dose * supp, data = tg)
log_action(log, action = "run", object = "model_1",
           reason = "lm(len ~ dose * supp) with dose numeric, per analysis plan v1")
print(round(summary(fit1)$coefficients, 3))

sec("B3. A documented change of specification")
log_change(log, object = "model_spec", field = "dose",
           before = "numeric", after = "factor",
           reason = "Dose takes three discrete levels (0.5, 1, 2 mg/day); modelled as a factor")
tg$dose_f <- factor(tg$dose)
fit2 <- lm(len ~ dose_f * supp, data = tg)
log_action(log, action = "run", object = "model_2",
           reason = "lm(len ~ dose_f * supp) after the specification change")
print(round(summary(fit2)$coefficients, 3))

sec("B4. Sign off")
log_signature(log, "I reviewed model_2 against analysis plan v1 and the documented change, and accept it.")

sec("B5. The audit trail as a table")
print(as.data.frame(log))

sec("B6. Verify the log")
v <- verify_log(log)
cat("intact =", v$intact, "; entries =", v$n_entries, "\n")

sec("B7. Alter one past entry in a copy of the file, then verify the copy")
lines <- readLines(rlog)
i <- grep("specification|Dose takes three", lines)[1]
tampered <- tempfile(fileext = ".rlog")
new_line <- sub("Dose takes three discrete levels", "Dose takes two discrete levels", lines[i], fixed = TRUE)
cat("Line changed:", !identical(new_line, lines[i]), "\n")
lines[i] <- new_line
writeLines(lines, tampered)
bad <- verify_log(tampered)
cat("intact =", bad$intact, "; first broken =", paste(bad$first_broken, collapse = ","), "\n")

# ---- C. Reproducibility: audit, certify, drift --------------------------------
sec("C1. Audit the analysis script")
script <- tempfile(fileext = ".R")
writeLines(c(
  "set.seed(2026)",
  "fit <- stats::lm(len ~ factor(dose) * supp, data = datasets::ToothGrowth)",
  "boot <- replicate(200, mean(sample(datasets::ToothGrowth$len, replace = TRUE)))"), script)
rep <- audit_script(script, renv = FALSE, verbose = FALSE)
print(rep)
print(rep$calls)

sec("C2. Score the risks")
risks <- risk_score(rep)
print(risks)

sec("C3. Certify the outputs as a baseline")
cert <- tempfile()
base_out <- list(coefs = coef(fit2), r_squared = summary(fit2)$r.squared, n_obs = nrow(tg))
certify(outputs = base_out, tag = "baseline-v1", script = "analysis.R", file = cert)
print(list_certs(file = cert))

sec("C4. Re-run with the same data: expect no drift")
fit_same <- lm(len ~ dose_f * supp, data = tg)
print(check_drift(list(coefs = coef(fit_same), r_squared = summary(fit_same)$r.squared, n_obs = nrow(tg)),
                  against = "baseline-v1", file = cert))

sec("C5. One row quietly dropped: expect drift")
tg2 <- tg[-1, ]
fit_drop <- lm(len ~ dose_f * supp, data = tg2)
print(check_drift(list(coefs = coef(fit_drop), r_squared = summary(fit_drop)$r.squared, n_obs = nrow(tg2)),
                  against = "baseline-v1", file = cert))

sec("C6. Report")
repro_report(rep, risks, format = "text", style = "pharma")

sec("D. Session")
print(utils::sessionInfo())
sink()
cat("\nWrote", out_txt, "\n")
