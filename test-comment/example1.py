# Returns the number of days between two dates
def calculate_days(start_date, end_date):
    delta = end_date - start_date
    return delta.days